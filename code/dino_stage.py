from transformers import AutoModel, AutoImageProcessor
import torch
import numpy as np
from PIL import Image
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor

device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

model = AutoModel.from_pretrained('facebook/dinov2-base')
processor = AutoImageProcessor.from_pretrained('facebook/dinov2-base')
model = model.to(device)
model.eval()

def get_embeddings(imgs_dict, batch_size=32):
    names = list(imgs_dict.keys())
    imgs = list(imgs_dict.values())
    all_embeddings = []

    for i in range(0, len(imgs), batch_size):
        batch = imgs[i:i+batch_size]
        inputs = processor(images=batch, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = model(**inputs)
        embeddings = outputs.last_hidden_state[:, 0, :].cpu().numpy()
        all_embeddings.append(embeddings)
        print(f"embedded batch {i//batch_size + 1}")

    if not all_embeddings:
        return names, np.empty((0, 0))

    return names, np.vstack(all_embeddings)

def find_similar(remaining, http, threshold=0.85, chunk_size=256, progress=None):
    def download_image(item):
        # Skip any image that fails to download/decode instead of letting the
        # exception propagate out of executor.map and abort the whole stage.
        try:
            filename = item['filename']
            url = item['url']
            img_response = http.get(url, timeout=30)
            if img_response.status_code != 200:
                raise ValueError(f"HTTP {img_response.status_code} for {filename}")
            img = Image.open(BytesIO(img_response.content)).convert('RGB')
            return filename, img
        except Exception as e:
            print(f"skipped photo during dino download: {e}")
            return None, None

    if not remaining:
        return []

    # Download + embed in chunks. Only one chunk of images is ever held in
    # memory at once; we keep just the small embedding vectors afterward. This
    # keeps peak memory flat even for a couple thousand photos (the previous
    # version loaded every image at once, which could exhaust memory and kill
    # the process mid-scan).
    names = []
    embeddings_parts = []
    total = len(remaining)
    processed = 0

    for start in range(0, total, chunk_size):
        chunk = remaining[start:start + chunk_size]
        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(download_image, chunk))

        imgs_dict = {filename: img for filename, img in results if filename is not None}
        processed += len(chunk)
        if progress is not None:
            progress.put(f"analyzed {min(processed, total)}/{total} for similarity…")

        if not imgs_dict:
            continue

        cnames, cembeddings = get_embeddings(imgs_dict)
        names.extend(cnames)
        embeddings_parts.append(cembeddings)
        # imgs_dict is rebound on the next iteration, freeing this chunk's images

    # Need at least two images to have any pair to compare.
    if len(names) < 2 or not embeddings_parts:
        return []

    embeddings = np.vstack(embeddings_parts)

    if embeddings.shape[0] < 2:
        return []

    # Vectorized cosine similarity: normalize each embedding, then a single
    # matrix multiply gives the full pairwise similarity matrix. This replaces
    # the O(n^2) pure-Python double loop, which became unusably slow (millions
    # of iterations) for large photo sets.
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12  # avoid divide-by-zero for degenerate embeddings
    normalized = embeddings / norms
    similarity = normalized @ normalized.T

    # Take the upper triangle (i < j) above the threshold.
    iu, ju = np.triu_indices(len(names), k=1)
    mask = similarity[iu, ju] >= threshold

    duplicates = [(names[i], names[j]) for i, j in zip(iu[mask], ju[mask])]

    return duplicates