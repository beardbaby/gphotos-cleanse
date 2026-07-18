from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from test_main import run_pipeline
import requests
import threading
import os
from auth2 import authenticate

app = FastAPI()

# Allowed frontend origins. The hosted site is the default so the helper works
# out of the box for end users; localhost stays allowed for local development.
# Override with FRONTEND_ORIGINS (comma-separated) if you deploy to a different URL.
# ---- CHANGE THIS if your Vercel URL is not gphotos-cleanse.vercel.app ----
_DEFAULT_ORIGINS = "https://gphotos-cleanse.vercel.app,http://localhost:3000"
_origins = os.environ.get("FRONTEND_ORIGINS", _DEFAULT_ORIGINS)
allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# When the frontend is hosted (https) but the backend runs on the visitor's own
# machine (http://localhost:8000), Chrome's Private Network Access check sends a
# preflight that must be answered with this header. Harmless in the local setup.
@app.middleware("http")
async def allow_private_network(request, call_next):
    response = await call_next(request)
    if request.method == "OPTIONS":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

session_store = {}

# Cache the Google credentials so we don't re-read/refresh token.json on every
# single /image request (the results page can trigger hundreds of them). The
# token is refreshed as needed and reused until close to expiry.
_creds_lock = threading.Lock()
_creds_cache = {'creds': None}


def get_credentials():
    with _creds_lock:
        creds = _creds_cache['creds']
        if creds is not None and getattr(creds, 'valid', False):
            return creds
        creds = authenticate()
        _creds_cache['creds'] = creds
        return creds


class Progress:
    """Thread-safe holder for the latest progress message. run_pipeline calls
    .put(); the /result endpoint reads .get(). Replaces the old SSE stream so
    the frontend can just poll instead of holding a long-lived connection."""

    def __init__(self):
        self._lock = threading.Lock()
        self._latest = 'starting…'

    def put(self, msg):
        with self._lock:
            self._latest = msg

    def get(self):
        with self._lock:
            return self._latest


@app.get("/start")
def start():
    creds = get_credentials()
    http = requests.Session()
    http.headers.update({'Authorization': 'Bearer ' + creds.token})

    response = http.post('https://photospicker.googleapis.com/v1/sessions')
    session = response.json()

    session_store['session_id'] = session['id']
    session_store['http'] = http
    # a new pick invalidates any previous scan result
    session_store.pop('job', None)

    return {'picker_url': session['pickerUri']}


@app.get("/scan")
def scan():
    """Kick off the (potentially multi-minute) dedup pipeline in a background
    thread and return immediately. The frontend polls /result for progress and
    the final groups, so no single request is ever held open for the whole run
    — which is what used to fail as "Failed to fetch" on large libraries."""
    if 'session_id' not in session_store or 'http' not in session_store:
        raise HTTPException(status_code=400, detail="No active session. Start a scan first.")

    session_id = session_store['session_id']
    http = session_store['http']

    progress = Progress()
    job = {'status': 'running', 'progress': progress, 'phash': [], 'dino': [], 'error': None}
    session_store['job'] = job

    def worker():
        try:
            phash_result, dino_result, url_map = run_pipeline(session_id, http, progress)

            def build(groups):
                # .get + drop-missing so a name absent from url_map can't raise
                return [
                    [{'filename': n, 'url': url_map.get(n)} for n in group if url_map.get(n)]
                    for group in groups
                ]

            job['phash'] = [g for g in build(phash_result) if len(g) > 1]
            job['dino'] = [g for g in build(dino_result) if len(g) > 1]
            job['status'] = 'done'
            progress.put('done')
        except Exception as e:
            print(f"pipeline failed: {e}")
            job['error'] = str(e)
            job['status'] = 'error'
            progress.put('error')

    threading.Thread(target=worker, daemon=True).start()
    return {'status': 'running'}


@app.get("/result")
def result():
    """Poll target: returns the running status + latest progress, and the
    grouped duplicates once the background scan finishes."""
    job = session_store.get('job')
    if not job:
        raise HTTPException(status_code=400, detail="No scan in progress. Start a scan first.")

    return {
        'status': job['status'],
        'progress': job['progress'].get(),
        'phash': job['phash'],
        'dino': job['dino'],
        'error': job['error'],
    }


@app.get("/image")
def get_image(url: str):
    creds = get_credentials()
    try:
        img_response = requests.get(
            url,
            headers={'Authorization': 'Bearer ' + creds.token},
            timeout=30,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch image: {e}")

    if img_response.status_code != 200:
        raise HTTPException(status_code=img_response.status_code, detail="Failed to fetch image")

    content_type = img_response.headers.get('Content-Type', 'image/jpeg')
    return Response(content=img_response.content, media_type=content_type)


if __name__ == "__main__":
    # Run the backend locally:  python main.py   (serves on http://localhost:8000)
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
