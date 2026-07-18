import { useState, useEffect, useRef } from 'react';
import './App.css';

// Single source of truth: index.html injects window.EXTENSION_ID. This id is
// pinned by the "key" field in the extension's manifest.json, so it is the same
// for every user who loads the extension.
const EXTENSION_ID = (typeof window !== 'undefined' && window.EXTENSION_ID) || 'cbccbicdjdhcfdmdahhloijcnlfpjjlf';

// Backend base URL. Set REACT_APP_API_BASE at build time for production
// (e.g. https://api.yourdomain.com); defaults to the local dev server.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

// The helper app is distributed via a GitHub Release: the repo is public and the
// zip bundles credentials.json, so it can't be served from the site. This "latest"
// URL always resolves to the newest release's attached zip.
const HELPER_DOWNLOAD_URL = 'https://github.com/beardbaby/gphotos-cleanse/releases/latest/download/duplicate-finder-helper.zip';

// Terminal commands users paste to start the helper. Running from a terminal
// (rather than double-clicking) sidesteps the macOS "unverified" Gatekeeper block.
const MAC_CMD = 'bash ~/Downloads/duplicate-finder-helper/start-helper.command';
const WIN_CMD = '"%USERPROFILE%\\Downloads\\duplicate-finder-helper\\start-helper.bat"';

// Pull an "X / Y" ratio out of a backend progress string to drive a
// determinate bar; returns null when the string has no parseable numbers.
function parseProgressPct(str) {
  if (!str) return null;
  const m = str.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const done = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

// ---- inline line icons (kept minimal; monochrome via currentColor) ----
const svgBase = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};
const svg = (size, children) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase}>{children}</svg>
);
const IconScan = ({ size = 20 }) => svg(size, <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.6-4.6" /></>);
const IconExpand = ({ size = 18 }) => svg(size, <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-8 8" /><path d="M3 21l8-8" /></>);
const IconClose = ({ size = 20 }) => svg(size, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
const IconCheck = ({ size = 16 }) => svg(size, <path d="M20 6 9 17l-5-5" />);
const IconWarning = ({ size = 18 }) => svg(size, <><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>);
const IconCheckCircle = ({ size = 44 }) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>);
const IconInfo = ({ size = 16 }) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
const IconDownload = ({ size = 18 }) => svg(size, <><path d="M12 3v12" /><path d="m7 10.5 5 5 5-5" /><path d="M5 21h14" /></>);

// A monochrome copyable command block.
function CopyCmd({ os, command }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    try {
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }, () => {});
    } catch (e) { /* clipboard unavailable */ }
  }
  return (
    <div className="cmd">
      <span className="cmd__os">{os}</span>
      <div className="cmd__row">
        <code className="cmd__text">{command}</code>
        <button
          type="button"
          className={'cmd__copy' + (copied ? ' is-copied' : '')}
          onClick={copy}
          aria-label={`Copy command for ${os}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// The "How it works" page — explains the two-stage matching pipeline.
function AboutPage({ onBack }) {
  return (
    <main id="main" className="main about">
      <header className="about__hero">
        <p className="about__eyebrow">How it works</p>
        <h1 className="about__title">Finding duplicates, in two passes.</h1>
        <p className="about__lead">
          Duplicate Finder compares your photos entirely on your own computer, using two
          complementary techniques. The first catches exact and near-exact copies fast; the
          second understands what a photo actually looks like, to catch the look-alikes the
          first pass can't.
        </p>
      </header>

      <section className="about__stage">
        <div className="about__stagehead">
          <span className="about__stagenum">01</span>
          <h2 className="about__h">Perceptual hashing (pHash)</h2>
        </div>
        <p className="about__p">
          Each image is shrunk to a tiny greyscale thumbnail and run through a <b>discrete cosine
          transform</b> — the same math behind JPEG. We keep only the low-frequency information,
          which captures the broad structure of the picture while ignoring fine detail, colour,
          and compression noise. That produces a compact 64-bit <b>fingerprint</b>.
        </p>
        <div className="about__chip">
          <span>fingerprint</span>
          <code>1011&nbsp;0100 · 1101&nbsp;0011 · 0110&nbsp;0010 · …</code>
        </div>
        <p className="about__p">
          Two photos that look the same get almost the same fingerprint — even if one was re-saved,
          resized, or lightly recompressed. We compare fingerprints by <b>Hamming distance</b> (how
          many bits differ), organised in a BK-tree so it stays fast across thousands of photos.
          Anything within a few bits is grouped as an <b>exact duplicate</b>.
        </p>
        <p className="about__catch">Catches: re-saves, format changes, resizes, screenshots of the same image, minor compression.</p>
      </section>

      <section className="about__stage">
        <div className="about__stagehead">
          <span className="about__stagenum">02</span>
          <h2 className="about__h">Visual embeddings (DINOv2)</h2>
        </div>
        <p className="about__p">
          Fingerprints can't tell that two <i>different</i> photos are of the same moment — a burst
          of shots, the same scene re-framed, or an edited copy. For everything the first pass
          didn't group, we use <b>DINOv2</b>, a vision model from Meta AI trained (without any
          labels) to understand image content.
        </p>
        <p className="about__p">
          DINOv2 turns each photo into a list of numbers — an <b>embedding</b> — that represents
          what's in it. Photos of the same subject land close together in that space. We measure
          the <b>cosine similarity</b> between every pair and group the ones above a high threshold
          as <b>similar photos</b>.
        </p>
        <p className="about__catch">Catches: burst shots, slightly different angles, crops, filters and edits, near-identical moments.</p>
      </section>

      <section className="about__stage">
        <div className="about__stagehead">
          <span className="about__stagenum">·</span>
          <h2 className="about__h">Why it runs on your machine</h2>
        </div>
        <p className="about__p">
          Both passes happen locally, inside the helper app. Your photos are only ever sent to
          Google — to fetch the ones you picked — never to us or any third party. Deletion is
          handled by the browser extension, which moves your chosen copies to the Google Photos
          trash, where they're recoverable for 60 days.
        </p>
      </section>

      <div className="about__foot">
        <button type="button" className="btn btn--primary" onClick={onBack}>Back to the app</button>
      </div>
    </main>
  );
}

function App() {
  const [view, setView] = useState('home');       // 'home' | 'about'
  const [status, setStatus] = useState('idle');
  const [dupes, setDupes] = useState({ phash: [], dino: [] });
  const [progress, setProgress] = useState('');
  const [deleting, setDeleting] = useState({});   // key -> true | 'done'
  const [selected, setSelected] = useState({});   // key -> filename
  const [batch, setBatch] = useState(null);       // { total, done, complete } while a batch runs
  const [zoom, setZoom] = useState(null);         // photo shown in the lightbox, or null
  const [error, setError] = useState('');         // user-facing error message, or ''
  const [livePolite, setLivePolite] = useState('');       // aria-live polite announcements
  const [liveAssertive, setLiveAssertive] = useState(''); // aria-live assertive announcements

  const pollTimerRef = useRef(null);   // pending /result poll, so we can cancel it
  const pollGenRef = useRef(0);        // generation guard: invalidates in-flight polls
  const dialogRef = useRef(null);      // lightbox container (focus trap)
  const closeBtnRef = useRef(null);    // lightbox close button (initial focus)
  const triggerRef = useRef(null);     // element that opened the lightbox (restore focus)

  const selectedCount = Object.keys(selected).length;
  const phashGroups = dupes.phash || [];
  const dinoGroups = dupes.dino || [];
  const scanPct = parseProgressPct(progress);
  const batchRunning = !!(batch && !batch.complete);   // a deletion is in flight

  // Announce selection changes politely via the persistent live region.
  useEffect(() => {
    if (selectedCount > 0) {
      setLivePolite(`${selectedCount} ${selectedCount === 1 ? 'photo' : 'photos'} selected`);
    }
  }, [selectedCount]);

  // Cancel any pending poll on unmount.
  useEffect(() => {
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightbox: focus management, focus trap, Escape, and inert background.
  useEffect(() => {
    if (!zoom) return;
    // Make the whole app shell inert behind the modal (not just <main>).
    const inertEls = [
      document.getElementById('main'),
      document.querySelector('.app-header'),
      document.querySelector('.skip-link'),
    ].filter(Boolean);
    inertEls.forEach(el => el.setAttribute('aria-hidden', 'true'));
    const focusTimer = setTimeout(() => { if (closeBtnRef.current) closeBtnRef.current.focus(); }, 0);

    const onKey = (e) => {
      if (e.key === 'Escape') { setZoom(null); return; }
      if (e.key !== 'Tab') return;
      const dlg = dialogRef.current;
      if (!dlg) return;
      const f = dlg.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
      inertEls.forEach(el => el.removeAttribute('aria-hidden'));
      const t = triggerRef.current;
      if (t && typeof t.focus === 'function') t.focus();
    };
  }, [zoom]);

  function stopPolling() {
    // Bump the generation so any in-flight /result fetch won't re-arm the loop.
    pollGenRef.current += 1;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function goHome() { setView('home'); }
  function goAbout() { setView('about'); window.scrollTo(0, 0); }

  function handleScan() {
    setError('');
    setStatus('starting');
    fetch(`${API_BASE}/start`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data || !data.picker_url) throw new Error('No picker URL returned.');
        window.open(data.picker_url, '_blank');
        setStatus('picking');
      })
      .catch(() => {
        setError("We couldn't start the scan. Make sure the Duplicate Finder app is running on your computer, then try again.");
        setStatus('idle');
      });
  }

  function handleDone() {
    setError('');
    setProgress('starting…');
    setStatus('loading');
    stopPolling();

    // Start the scan as a background job, then poll for the result. Each request
    // is short, so a slow pipeline can't drop the connection mid-flight.
    fetch(`${API_BASE}/scan`)
      .then(res => {
        if (!res.ok) {
          return res.json().catch(() => ({})).then(body => {
            throw new Error(body.detail || `Server returned ${res.status}`);
          });
        }
        return res.json();
      })
      .then(() => pollResult(0, pollGenRef.current))
      .catch(() => {
        setError("We couldn't begin scanning. Check that the app is running on your computer, then click Done selecting again.");
        setStatus('picking');
      });
  }

  function pollResult(failures, gen) {
    fetch(`${API_BASE}/result`)
      .then(res => {
        if (!res.ok) {
          return res.json().catch(() => ({})).then(body => {
            throw new Error(body.detail || `Server returned ${res.status}`);
          });
        }
        return res.json();
      })
      .then(data => {
        if (gen !== pollGenRef.current) return;   // superseded by a new scan / unmount

        if (data.progress) {
          setProgress(data.progress);
          setLivePolite(data.progress);
        }

        if (data.status === 'done') {
          const phash = data.phash || [];
          const dino = data.dino || [];
          setDupes({ phash, dino });
          setStatus('done');
          stopPolling();
          const groupCount = phash.length + dino.length;
          setLiveAssertive(
            groupCount > 0
              ? `Scan complete — ${groupCount} duplicate ${groupCount === 1 ? 'group' : 'groups'} found.`
              : 'Scan complete — no duplicates found.'
          );
        } else if (data.status === 'error') {
          setError(`The scan hit a snag. ${data.error || 'Something went wrong'}. Give it another try — if it keeps happening, restart the app.`);
          setStatus('picking');
          stopPolling();
        } else {
          // still running — check again shortly
          pollTimerRef.current = setTimeout(() => pollResult(0, gen), 1500);
        }
      })
      .catch(() => {
        if (gen !== pollGenRef.current) return;   // superseded by a new scan / unmount
        // tolerate a handful of transient network blips before giving up
        if (failures < 5) {
          pollTimerRef.current = setTimeout(() => pollResult(failures + 1, gen), 2000);
        } else {
          setError("We lost the connection mid-scan. Make sure the app is still running, then start a new scan.");
          setStatus('picking');
          stopPolling();
        }
      });
  }

  function revertDeleting(items) {
    setDeleting(prev => {
      const next = { ...prev };
      items.forEach(it => { if (next[it.key] === true) delete next[it.key]; });
      return next;
    });
  }

  // Delete a list of photos through the extension's port, one at a time.
  // Used by both the per-card Delete and the batch "Delete selected".
  function deletePhotosViaPort(items) {
    if (!items || items.length === 0) return;
    // Only one deletion run at a time so batch state can't be stomped.
    if (batch && !batch.complete) return;

    if (!window.chrome || !window.chrome.runtime) {
      setError("We can't reach the deletion helper. The Duplicate Finder extension needs to be installed and enabled to move photos to trash. Turn it on, then try deleting again.");
      return;
    }

    setDeleting(prev => {
      const next = { ...prev };
      items.forEach(it => { next[it.key] = true; });
      return next;
    });
    setBatch({ total: items.length, done: 0, complete: false });
    setLivePolite(`Deleting ${items.length} ${items.length === 1 ? 'photo' : 'photos'}`);

    let port;
    try {
      port = window.chrome.runtime.connect(EXTENSION_ID);
    } catch (e) {
      revertDeleting(items);
      setBatch(null);
      setError("The extension didn't respond. Reload this page, make sure the Duplicate Finder extension is enabled, then try again.");
      return;
    }

    let sawMessage = false;
    let finalized = false;
    let doneCount = 0;

    // Clean finish. The extension calls port.disconnect() right after posting
    // 'complete', which can drop that final message — so a normal (error-free)
    // disconnect is the source of truth: fill the bar to 100% and show the
    // completion toast regardless.
    const finalizeComplete = () => {
      if (finalized) return;
      finalized = true;
      setDeleting(prev => {
        const next = { ...prev };
        items.forEach(it => { next[it.key] = 'done'; });
        return next;
      });
      setBatch(prev => (prev ? { ...prev, done: prev.total, complete: true } : prev));
      setLiveAssertive(`Deleted ${items.length} of ${items.length} ${items.length === 1 ? 'photo' : 'photos'}.`);
    };

    // Abnormal drop mid-batch (e.g. the extension worker was killed). Keep only
    // the photos actually confirmed deleted, revert the rest so they can be
    // retried, and report the partial result instead of a false "all deleted".
    const finalizePartial = () => {
      if (finalized) return;
      finalized = true;
      setDeleting(prev => {
        const next = { ...prev };
        items.forEach(it => { if (next[it.key] !== 'done') delete next[it.key]; });
        return next;
      });
      setBatch(null);
      setError(`Deletion stopped after ${doneCount} of ${items.length} ${items.length === 1 ? 'photo' : 'photos'} — the rest weren't deleted. Select them and try again.`);
    };

    port.onMessage.addListener((m) => {
      if (!m) return;
      sawMessage = true;
      if (m.type === 'progress') {
        setDeleting(prev => ({ ...prev, [m.key]: m.state === 'done' ? 'done' : true }));
        if (m.state === 'done') {
          doneCount += 1;
          setBatch(prev => (prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : prev));
        }
      } else if (m.type === 'complete') {
        finalizeComplete();
      }
    });

    port.onDisconnect.addListener(() => {
      const hadError = !!(window.chrome.runtime && window.chrome.runtime.lastError);
      if (hadError && !sawMessage) {
        // The connection never established (extension missing/disabled).
        revertDeleting(items);
        setBatch(null);
        setError("We can't reach the deletion helper. Make sure the Duplicate Finder extension is installed and enabled, then try deleting again.");
      } else if (hadError && sawMessage) {
        // Dropped mid-batch after some deletions had already happened.
        finalizePartial();
      } else {
        // Clean finish (or a dropped final 'complete' on a normal disconnect).
        finalizeComplete();
      }
    });

    port.postMessage({ action: 'deletePhotos', items });
  }

  function handleDelete(filename, key) {
    deletePhotosViaPort([{ key, filename }]);
  }

  function handleDeleteSelected() {
    const items = Object.entries(selected).map(([key, filename]) => ({ key, filename }));
    if (items.length === 0) return;

    const ok = window.confirm(
      `Delete ${items.length} ${items.length === 1 ? 'photo' : 'photos'}? ` +
      `They'll move to your Google Photos trash — recoverable for 60 days.\n\n` +
      `This runs in the background and can take a while. Please don't touch your computer until it finishes, or some photos may be skipped.`
    );
    if (!ok) return;

    setSelected({});
    deletePhotosViaPort(items);
  }

  function toggleSelect(key, filename) {
    setSelected(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = filename;
      return next;
    });
  }

  // Select every photo in a group EXCEPT the first (kept). Photos already being
  // deleted are skipped; the first is force-deselected so you can never delete
  // every copy.
  function selectAllButFirst(group, groupKey) {
    setSelected(prev => {
      const next = { ...prev };
      group.forEach((photo, j) => {
        const key = `${groupKey}-${j}`;
        if (j === 0) { delete next[key]; return; }
        if (!deleting[key]) next[key] = photo.filename;
      });
      return next;
    });
  }

  // Same idea across every exact-duplicate (pHash) group at once.
  function selectAllButOnePhash() {
    setSelected(prev => {
      const next = { ...prev };
      phashGroups.forEach((group, i) => {
        const groupKey = `phash-${i}`;
        group.forEach((photo, j) => {
          const key = `${groupKey}-${j}`;
          if (j === 0) { delete next[key]; return; }
          if (!deleting[key]) next[key] = photo.filename;
        });
      });
      return next;
    });
  }

  function openZoom(photo, triggerEl) {
    triggerRef.current = triggerEl || document.activeElement;
    setZoom(photo);
  }

  // Build a higher-resolution image URL for the lightbox by swapping the
  // Google Photos size suffix (thumbnails are served at =w256-h256).
  function bigImageUrl(photoUrl) {
    const bigger = photoUrl.replace(/=w\d+-h\d+$/, '=w1600-h1600');
    return `${API_BASE}/image?url=${bigger}`;
  }

  // ---- render helpers ----
  function renderPhotoCard(photo, key) {
    const deleteState = deleting[key];         // undefined | true | 'done'
    const isSelected = !!selected[key];
    const selectable = !deleteState;
    const photoClass =
      'photo' +
      (isSelected ? ' is-selected' : '') +
      (deleteState === 'done' ? ' is-done' : '');

    return (
      <li key={key} className={photoClass}>
        <div className="photo__media">
          <div
            className="photo__frame"
            role={selectable ? 'checkbox' : undefined}
            aria-checked={selectable ? isSelected : undefined}
            aria-label={selectable ? `Select ${photo.filename} for deletion` : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={selectable ? () => toggleSelect(key, photo.filename) : undefined}
            onKeyDown={selectable ? (e) => {
              if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelect(key, photo.filename); }
            } : undefined}
          >
            <img
              className="photo__img"
              src={`${API_BASE}/image?url=${photo.url}`}
              alt=""
            />
            <span className="check-badge" aria-hidden="true"><IconCheck size={16} /></span>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn--glass photo__zoom"
            aria-label={`View ${photo.filename} larger`}
            onClick={(e) => openZoom(photo, e.currentTarget)}
          >
            <IconExpand size={17} />
          </button>
        </div>

        <p className="photo__name" title={photo.filename}>{photo.filename}</p>

        {deleteState === 'done' ? (
          <button type="button" className="btn btn--sm photo__delete is-done" disabled aria-label={`${photo.filename} deleted`}>Deleted ✓</button>
        ) : deleteState ? (
          <button type="button" className="btn btn--sm photo__delete is-deleting" disabled aria-label={`Deleting ${photo.filename}`}>Deleting…</button>
        ) : (
          <button
            type="button"
            className="btn btn--sm btn--danger-soft photo__delete"
            aria-label={`Delete ${photo.filename}`}
            disabled={batchRunning}
            onClick={() => handleDelete(photo.filename, key)}
          >
            Delete
          </button>
        )}
      </li>
    );
  }

  function renderGroup(group, groupKey, displayIndex) {
    return (
      <div key={groupKey} className="group" role="group" aria-labelledby={`${groupKey}-h`}>
        <div className="group__head">
          <h3 className="group__label" id={`${groupKey}-h`}>
            Group {displayIndex + 1} · <b>{group.length}</b> photos
          </h3>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            aria-label={`Select all but the first photo in Group ${displayIndex + 1}`}
            onClick={() => selectAllButFirst(group, groupKey)}
          >
            Select all but first
          </button>
        </div>
        <ul className="group__photos">
          {group.map((photo, j) => renderPhotoCard(photo, `${groupKey}-${j}`))}
        </ul>
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to main content</a>

      {/* live regions — kept OUTSIDE <main> so they keep announcing even while
          the lightbox marks the rest of the app inert */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{livePolite}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{liveAssertive}</div>

      <header className="app-header">
        <button type="button" className="brand" onClick={goHome} aria-label="Duplicate Finder — home">
          <span className="brand__mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="7" y="6" width="12" height="12" rx="3" fill="currentColor" opacity="0.45" />
              <rect x="4" y="9" width="12" height="11" rx="3" fill="currentColor" />
            </svg>
          </span>
          <span className="brand__name">Duplicate Finder</span>
        </button>
        <nav className="nav" aria-label="Primary">
          <button type="button" className="nav__link" aria-current={view === 'home' ? 'page' : undefined} onClick={goHome}>Home</button>
          <button type="button" className="nav__link" aria-current={view === 'about' ? 'page' : undefined} onClick={goAbout}>How it works</button>
        </nav>
      </header>

      {view === 'about' ? (
        <AboutPage onBack={goHome} />
      ) : (
        <main id="main" className="main">
          {error && (
            <div className="error-banner" role="alert">
              <span className="error-banner__icon"><IconWarning size={18} /></span>
              <span className="error-banner__msg">{error}</span>
              <button type="button" className="icon-btn icon-btn--bare" aria-label="Dismiss error" onClick={() => setError('')}>
                <IconClose size={16} />
              </button>
            </div>
          )}

          {status === 'idle' && (
            <div className="home">
              <section className="hero">
                <h1 className="hero__title">Clean the duplicates out of your Google Photos.</h1>
                <p className="hero__sub">Scan your library, review exact duplicates and look-alikes side by side, and keep just one of each.</p>
                <button type="button" className="btn btn--primary btn--hero" onClick={handleScan}>
                  <IconScan size={20} /> Scan my photos
                </button>
                <p className="hero__note">Free · runs on your own computer · deletions are recoverable for 60 days</p>

                <div className="demo" role="img" aria-label="Two matching photos collapse into one; the duplicates are removed and a single photo is kept.">
                  <div className="demo__row" aria-hidden="true">
                    <span className="demo__tile d1" />
                    <span className="demo__tile d2" />
                    <span className="demo__tile keep"><IconCheck size={18} /></span>
                  </div>
                </div>
              </section>

              <section className="setup" aria-labelledby="setup-h">
                <h2 id="setup-h" className="setup__title">Before your first scan</h2>
                <p className="setup__sub">Two quick, one-time installs. Follow along — it takes a couple of minutes.</p>

                <ol className="setup__list">
                  <li className="setup-step">
                    <div className="setup-step__num">1</div>
                    <div className="setup-step__body">
                      <h3 className="setup-step__title">Download &amp; run the app</h3>
                      <p className="setup-step__desc">This small app runs on your computer and does the scanning. Download it, unzip it to your Downloads folder, then start it from your terminal.</p>
                      <a className="btn btn--primary" href={HELPER_DOWNLOAD_URL}>
                        <IconDownload size={17} /> Download the app
                      </a>
                      <div className="setup-step__cmds">
                        <p className="setup-step__cue">Then start it — open your terminal and paste one line:</p>
                        <CopyCmd os="macOS — open Terminal" command={MAC_CMD} />
                        <CopyCmd os="Windows — open Command Prompt" command={WIN_CMD} />
                        <p className="setup-step__fine">
                          The first run installs what it needs (a few minutes, one time). Keep the window open, and sign in with Google when you scan.
                          <span>Running it from the terminal is what avoids the macOS "unverified developer" prompt.</span>
                        </p>
                      </div>
                    </div>
                  </li>

                  <li className="setup-step">
                    <div className="setup-step__num">2</div>
                    <div className="setup-step__body">
                      <h3 className="setup-step__title">Add the browser extension</h3>
                      <p className="setup-step__desc">Needed only for deleting — it moves the copies you pick to your Google Photos trash. Works in Chrome, Edge, Brave and Arc.</p>
                      <a className="btn btn--primary" href={`${process.env.PUBLIC_URL}/duplicate-finder-extension.zip`} download>
                        <IconDownload size={17} /> Download the extension
                      </a>
                      <ol className="mini-steps">
                        <li>Unzip it to get a <code>duplicate-finder-extension</code> folder — keep it somewhere permanent.</li>
                        <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top-right).</li>
                        <li>Click <b>Load unpacked</b> and select that folder. Leave it enabled.</li>
                      </ol>
                    </div>
                  </li>
                </ol>

                <p className="setup__foot">Curious how the matching works? <button type="button" className="link" onClick={goAbout}>See how it works →</button></p>
              </section>

              <section className="notes" aria-label="Good to know">
                <div className="note">
                  <span className="note__k">2,000 per scan</span>
                  <span className="note__v">Google caps each pick at 2,000 photos — clean a large library in batches.</span>
                </div>
                <div className="note">
                  <span className="note__k">Hands-free delete</span>
                  <span className="note__v">Deletes run one at a time in the background — don't touch your computer until it finishes.</span>
                </div>
                <div className="note">
                  <span className="note__k">Recoverable</span>
                  <span className="note__v">Deleted photos sit in your Google Photos trash for 60 days.</span>
                </div>
              </section>
            </div>
          )}

          {status === 'starting' && (
            <div className="status-card">
              <div className="spinner" aria-hidden="true" />
              <h2 className="status-card__title">Opening Google Photos…</h2>
              <p className="status-card__sub">A new tab is opening so you can pick your photos. If it doesn't appear, check that pop-ups are allowed for this site.</p>
            </div>
          )}

          {status === 'picking' && (
            <div className="status-card">
              <h2 className="status-card__title">Select your photos</h2>
              <p className="status-card__sub">In the Google Photos tab, choose up to <b>2,000 photos</b> to check — then come back here and click <b>Done selecting</b>.</p>
              <button type="button" className="btn btn--primary btn--lg" onClick={handleDone}>Done selecting</button>
            </div>
          )}

          {status === 'loading' && (
            <div className="status-card" aria-busy="true">
              <div className="spinner" aria-hidden="true" />
              <h2 className="status-card__title">Scanning your photos</h2>
              <p className="status-card__sub">We're comparing each photo for matches. This can take a few minutes for a large batch — you can leave this tab open and check back.</p>
              {progress && <div className="progress-pill">{progress}</div>}
              {scanPct != null && (
                <div
                  className="scan-bar"
                  role="progressbar"
                  aria-label="Scanning photos"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={scanPct}
                  aria-valuetext={progress}
                >
                  <div className="scan-bar__fill" style={{ width: `${scanPct}%` }} />
                </div>
              )}
            </div>
          )}

          {status === 'done' && (
            <div>
              {phashGroups.length === 0 && dinoGroups.length === 0 && (
                <div className="empty">
                  <div className="empty__icon"><IconCheckCircle size={40} /></div>
                  <h2 className="empty__title">No duplicates found</h2>
                  <p className="empty__sub">Every photo in this batch looks one-of-a-kind. Want to check more? Run a scan with your next 2,000.</p>
                  <button type="button" className="btn btn--outline" onClick={handleScan}>Scan more photos</button>
                </div>
              )}

              {(phashGroups.length > 0 || dinoGroups.length > 0) && (
                <div className="results-tip">
                  <span className="results-tip__icon"><IconInfo size={16} /></span>
                  <span>Select the copies to remove — click <b>individual photos</b>, or use <b>Select all but one in each</b> to keep one from every group. One copy always stays.</span>
                </div>
              )}

              {phashGroups.length > 0 && (
                <section className="section" aria-labelledby="phash-h">
                  <div className="section__head">
                    <div className="section__titles">
                      <h2 className="section__title" id="phash-h">Exact duplicates</h2>
                      <p className="section__sub">Pixel-for-pixel copies. These are true duplicates — keep one, delete the rest with confidence.</p>
                    </div>
                    <span className="count-badge">{phashGroups.length} {phashGroups.length === 1 ? 'group' : 'groups'}</span>
                    <button type="button" className="btn btn--outline btn--sm" onClick={selectAllButOnePhash}>Select all but one in each</button>
                  </div>
                  {phashGroups.map((group, i) => renderGroup(group, `phash-${i}`, i))}
                </section>
              )}

              {dinoGroups.length > 0 && (
                <section className="section section--similar" aria-labelledby="dino-h">
                  <div className="section__head">
                    <div className="section__titles">
                      <h2 className="section__title" id="dino-h">Similar photos</h2>
                      <p className="section__sub">Near-identical shots — bursts, edits, or re-saves. Not exact copies, so glance at each before you delete.</p>
                    </div>
                    <span className="count-badge">{dinoGroups.length} {dinoGroups.length === 1 ? 'group' : 'groups'}</span>
                  </div>
                  {dinoGroups.map((group, i) => renderGroup(group, `dino-${i}`, i))}
                </section>
              )}

              {(phashGroups.length > 0 || dinoGroups.length > 0) && (
                <div className="done-footer">
                  <p className="done-footer__text">Cleaned this batch? Google Photos caps each scan at 2,000 photos — scan your next batch to keep going.</p>
                  <button type="button" className="btn btn--outline" onClick={handleScan}>Scan more photos</button>
                </div>
              )}

              {(batch || selectedCount > 0) && (
                <section className="bottom-stack" aria-label="Selection and deletion actions">
                  {batch && (
                    batch.complete ? (
                      <div className="progress-toast is-complete">
                        <span className="complete-check" aria-hidden="true"><IconCheck size={15} /></span>
                        <span className="progress-toast__label">
                          All {batch.total} {batch.total === 1 ? 'photo' : 'photos'} deleted
                        </span>
                        <button type="button" className="btn btn--ghost btn--sm" aria-label="Close deletion summary" onClick={() => setBatch(null)}>Close</button>
                      </div>
                    ) : (
                      <div className="progress-toast">
                        <span className="progress-toast__label">
                          Deleting {Math.min(batch.done + 1, batch.total)} of {batch.total}…
                        </span>
                        <div
                          className="progress-toast__track"
                          role="progressbar"
                          aria-label="Deleting selected photos"
                          aria-valuemin={0}
                          aria-valuemax={batch.total}
                          aria-valuenow={batch.done}
                          aria-valuetext={`Deleting ${Math.min(batch.done + 1, batch.total)} of ${batch.total}`}
                        >
                          <div className="progress-toast__fill" style={{ width: `${(batch.done / batch.total) * 100}%` }} />
                        </div>
                      </div>
                    )
                  )}

                  {selectedCount > 0 && (
                    <div className="action-bar">
                      <span className="action-bar__count"><b>{selectedCount}</b> selected</span>
                      <button type="button" className="btn btn--danger btn--sm" disabled={batchRunning} onClick={handleDeleteSelected}>Delete selected</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected({})}>Clear</button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      )}

      {zoom && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-cap"
          ref={dialogRef}
          onClick={() => setZoom(null)}
        >
          <img
            className="lightbox__img"
            src={bigImageUrl(zoom.url)}
            alt={`Enlarged view of ${zoom.filename}`}
            onClick={(e) => e.stopPropagation()}
          />
          <p className="lightbox__caption" id="lightbox-cap">{zoom.filename}</p>
          <button
            type="button"
            className="icon-btn icon-btn--glass lightbox__close"
            aria-label="Close enlarged view"
            ref={closeBtnRef}
            onClick={() => setZoom(null)}
          >
            <IconClose size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
