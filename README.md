# Duplicate Finder — Google Photos deduplicator

Find and clean up duplicate and near-duplicate photos in **your own** Google
Photos library. You pick the photos, the app groups the copies, you decide what
to delete — and the extras go to your Google Photos trash (recoverable for 60
days). Your photos are compared **on your own machine**; nothing about them is
sent anywhere except Google.

---

## How it works

The project has three parts that run locally and talk to each other:

```
┌──────────────────┐        ┌────────────────────────┐        ┌──────────────────────┐
│  React web app   │  HTTP  │  FastAPI backend       │  API   │  Google Photos       │
│  (this browser)  │ ─────▶ │  localhost:8000        │ ─────▶ │  Picker + Library    │
│                  │ ◀───── │  main.py               │ ◀───── │                      │
└────────┬─────────┘        └────────────────────────┘        └──────────────────────┘
         │ port messaging
         ▼
┌──────────────────┐
│  Chrome extension │  automates photos.google.com to move selected copies to trash
│  "Google Photos   │
│   Deleter"        │
└──────────────────┘
```

1. **Pick** — You click **Scan my photos**. The backend opens a Google Photos
   *picker* session and you choose up to **2,000 photos** per scan.
2. **Compare** — The backend downloads thumbnails of your picked photos and runs
   a two-stage dedup pipeline (see below), reporting live progress.
3. **Review** — Results come back in two sections: **Exact duplicates**
   (pixel-for-pixel copies) and **Similar photos** (bursts, edits, re-saves).
4. **Delete** — You select the copies to remove and the Chrome extension moves
   them to your Google Photos trash. One copy always stays.

### The dedup pipeline

Deduplication runs in two passes, so cheap exact-matching handles most of the
work before the heavier visual model runs on what's left:

| Stage | Technique | Catches |
|-------|-----------|---------|
| **1. Perceptual hash** | [`imagehash.phash`](https://pypi.org/project/ImageHash/) + a [BK-tree](https://pypi.org/project/pybktree/) nearest-neighbour search (Hamming distance ≤ 5), grouped with union-find | Exact / near-exact duplicates |
| **2. Visual embeddings** | [DINOv2](https://huggingface.co/facebook/dinov2-base) embeddings + vectorized cosine similarity (threshold 0.85) on everything stage 1 didn't group | Visually similar shots — crops, edits, filters, burst frames |

The pipeline is built to be robust on large libraries: media is fetched and
hashed in parallel, a single bad photo is skipped rather than aborting the run,
and images are embedded in memory-bounded chunks. The scan runs as a background
job the frontend polls, so no request is ever held open long enough to time out.

---

## Repository structure

```
.
├── src/                     # React frontend (Create React App)
│   └── App.js               #   the whole single-page UI + flow
├── public/
│   └── duplicate-finder-extension.zip   # packaged extension users download
├── code/                    # Python backend
│   ├── main.py              #   FastAPI server (localhost:8000)
│   ├── test_main.py         #   dedup pipeline: fetch + pHash + grouping
│   ├── dino_stage.py        #   DINOv2 visual-similarity stage
│   ├── auth2.py             #   Google OAuth (produces token.json)
│   ├── requirements.txt     #   Python dependencies
│   └── SETUP.md             #   end-user (non-developer) setup guide
├── extension_test/          # Chrome extension source ("Google Photos Deleter")
│   ├── manifest.json        #   MV3 manifest
│   ├── background.js        #   service worker — receives delete requests
│   ├── content.js           #   runs on photos.google.com
│   └── popup.html / popup.js
├── pack-extension.sh        # builds public/duplicate-finder-extension.zip
└── .env.example             # configuration reference
```

> **Note:** `extension_test/` is the extension **source**;
> `public/duplicate-finder-extension.zip` is the packaged copy the web app hands
> to users to load via `chrome://extensions`.

---

## Running it locally (developers)

You need **Python 3**, **Node.js**, and a **Google Cloud OAuth client** with the
Photos Picker API enabled.

### 1. Backend

```bash
cd code
pip install -r requirements.txt          # downloads torch + the DINOv2 model (~1 GB)
# place your OAuth client as code/credentials.json  (see below)
python main.py                           # serves on http://localhost:8000
```

On first run a browser window opens to **sign in with Google** — use the account
whose photos you want to clean. This writes `code/token.json` so you stay signed
in (Google expires it after a few days for unverified apps; just run `python
main.py` again to re-auth). Keep this terminal running while you use the app.

> `credentials.json` and `token.json` are **gitignored** and must never be
> committed — they're your private OAuth secrets.

### 2. Frontend

```bash
npm install
npm start                                # opens http://localhost:3000
```

### 3. Extension (needed only to delete)

1. Load `extension_test/` (or the unzipped `public/duplicate-finder-extension.zip`)
   via `chrome://extensions` → **Developer mode** → **Load unpacked**.
2. Leave it enabled. The web app connects to it by ID to perform deletions.

The extension is pinned to a stable ID via the `key` field in its
`manifest.json`, so it's the same for every user, and it only accepts
connections from `http://localhost:3000`.

---

## Configuration

Copy `.env.example` for the full list. The common knobs:

| Variable | Where | Purpose |
|----------|-------|---------|
| `REACT_APP_API_BASE` | frontend (build time) | Backend URL. Defaults to `http://localhost:8000`. |
| `FRONTEND_ORIGINS` | backend (runtime) | Comma-separated CORS allow-list. Defaults to `http://localhost:3000`. |

---

## Good to know

- **2,000 photos per scan.** That's a Google Photos picker limit — clean a large
  library in batches (scan → delete → scan the next 2,000).
- **Deletion runs hands-free.** Photos are trashed one at a time by automating
  Google Photos, so a big batch takes a while — don't touch your computer until
  it finishes, or some may be skipped. Kicking off a large delete before bed
  works well.
- **Recoverable.** Deletions go to your Google Photos trash and can be restored
  for 60 days.
- **Private.** Your photos are compared locally; only Google ever receives your
  sign-in.

For a non-developer, step-by-step setup guide, see [code/SETUP.md](code/SETUP.md).
