from PIL import Image
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
import threading
import imagehash
from pybktree import BKTree
from dino_stage import find_similar

def run_pipeline(session_id, http, progress):
    # Paginated fetch. Keep only still images — videos are dropped up front so
    # they never count toward the total or get downloaded. The picker can hand
    # back up to ~2000 mixed items, so this keeps the work focused on photos.
    media_items = []
    next_page_token = None
    videos_skipped = 0

    while True:
        url = f"https://photospicker.googleapis.com/v1/mediaItems?sessionId={session_id}&pageSize=100"
        if next_page_token:
            url += f"&pageToken={next_page_token}"
        response = http.get(url)
        data = response.json()
        for item in data.get('mediaItems', []):
            media_file = item.get('mediaFile') or {}
            if media_file.get('mimeType', '').startswith('image/'):
                media_items.append(item)
            else:
                videos_skipped += 1
        next_page_token = data.get('nextPageToken')
        if not next_page_token:
            break

    total = len(media_items)
    progress.put(f"found {total} photos, hashing…")
    print(f"fetched {total} images ({videos_skipped} non-image items skipped)")

    urls = {}
    progress_lock = threading.Lock()
    counters = {'done': 0, 'failed': 0}

    def download_and_hash(item):
        # Everything is wrapped so that a single bad photo (expired baseUrl,
        # rate-limited request, non-image content, corrupt bytes) can never
        # take down the whole run. Failures are skipped and counted.
        try:
            media_file = item.get('mediaFile') or {}
            mime = media_file.get('mimeType', '')
            base_url = media_file.get('baseUrl')
            filename = media_file.get('filename')
            if not mime.startswith('image/') or not base_url or not filename:
                return None, None

            thumbnail = base_url + '=w128-h128'
            img_response = http.get(thumbnail, timeout=30)
            if img_response.status_code != 200:
                raise ValueError(f"HTTP {img_response.status_code} for {filename}")

            img = Image.open(BytesIO(img_response.content)).convert('L')
            hash_value = imagehash.phash(img)

            # only record the url once we know the photo is usable
            urls[filename] = base_url + '=w256-h256'
            with progress_lock:
                counters['done'] += 1
                progress.put(f"hashed {counters['done']}/{total}")
            return filename, hash_value
        except Exception as e:
            with progress_lock:
                counters['failed'] += 1
            print(f"skipped photo during hashing: {e}")
            return None, None

    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(executor.map(download_and_hash, media_items))

    hashes = {}
    for filename, hash_value in results:
        if filename is not None:
            hashes[filename] = hash_value

    print(f"hashed {len(hashes)} images ({counters['failed']} skipped)")

    thresh = 5
    duplicates = []

    def hash_distance(a, b):
        return a[1] - b[1]

    tree = BKTree(hash_distance, list(hashes.items()))

    for name, h in hashes.items():
        matches = tree.find((name, h), thresh)
        for dist, (mname, _) in matches:
            if mname != name:
                duplicates.append((name, mname))

    names = set()
    for i in duplicates:
        names.add(i[0])
        names.add(i[1])

    parent = {}
    for i in names:
        parent[i] = i

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        parent[find(x)] = find(y)

    for a, b in duplicates:
        union(a, b)

    groups = {}
    for name in names:
        root = find(name)
        groups.setdefault(root, []).append(name)

    result = [g for g in groups.values() if len(g) > 1]

    remaining = []
    for name in hashes:
        if name not in names:
            remaining.append({'filename': name, 'url': urls[name]})

    print(f"remaining after pHash: {len(remaining)}")
    progress.put(f"checking {len(remaining)} photos for visual similarity…")
    dino_duplicates = find_similar(remaining, http, progress=progress)

    dino_names = set()
    for a, b in dino_duplicates:
        dino_names.add(a)
        dino_names.add(b)

    dino_parent = {name: name for name in dino_names}

    def dino_find(x):
        while dino_parent[x] != x:
            dino_parent[x] = dino_parent[dino_parent[x]]
            x = dino_parent[x]
        return x

    def dino_union(x, y):
        dino_parent[dino_find(x)] = dino_find(y)

    for a, b in dino_duplicates:
        dino_union(a, b)

    dino_groups = {}
    for name in dino_names:
        root = dino_find(name)
        dino_groups.setdefault(root, []).append(name)

    dino_result = [g for g in dino_groups.values() if len(g) > 1]
    progress.put("done")
    # phash groups (exact duplicates) and dino groups (visually similar) are
    # returned separately so the UI can show them as two distinct sections.
    return result, dino_result, urls