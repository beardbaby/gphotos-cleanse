import { useState, useEffect, useRef } from 'react';
import './App.css';

// Single source of truth: index.html injects window.EXTENSION_ID. This id is
// pinned by the "key" field in the extension's manifest.json, so it is the same
// for every user who loads the extension.
const EXTENSION_ID = (typeof window !== 'undefined' && window.EXTENSION_ID) || 'cbccbicdjdhcfdmdahhloijcnlfpjjlf';

// Backend base URL. Set REACT_APP_API_BASE at build time for production
// (e.g. https://api.yourdomain.com); defaults to the local dev server.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

// On-screen "how to use" guide shown on the idle screen. Bold verbs match the
// real on-screen button labels so the guide and UI stay in lockstep.
const STEPS = [
  { title: 'Start a scan', desc: (<>Hit <b>Scan my photos</b>. We'll open the Google Photos picker in a new tab.</>) },
  { title: 'Choose your photos', desc: (<>In the picker, select the photos you want to check — up to <b>2,000 at a time</b>.</>) },
  { title: 'Come back & confirm', desc: (<>Return to this tab and click <b>Done selecting</b>. We'll compare every photo — this takes a few minutes.</>) },
  { title: 'Review the matches', desc: (<>See two groups: <b>Exact duplicates</b> and <b>Similar photos</b>. Zoom in on any photo to be sure.</>) },
  { title: 'Keep one, select the rest', desc: (<>Two ways to choose: click <b>individual photos</b> you want gone, or use <b>Select all but one in each</b> to auto-keep one copy from every group.</>) },
  { title: 'Delete selected', desc: (<>Click <b>Delete selected</b>. The extras move to your Google Photos trash — recoverable for 60 days.</>) },
];

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) { /* ignore */ }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch (e) { /* ignore */ }
  return 'light';
}

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

// ---- inline line icons (replace emoji so the UI reads as crafted, not generic) ----
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
const IconSun = ({ size = 18 }) => svg(size, <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>);
const IconMoon = ({ size = 18 }) => svg(size, <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.6 6.6 0 0 0 11 11Z" />);
const IconExpand = ({ size = 18 }) => svg(size, <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-8 8" /><path d="M3 21l8-8" /></>);
const IconClose = ({ size = 20 }) => svg(size, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
const IconCheck = ({ size = 16 }) => svg(size, <path d="M20 6 9 17l-5-5" />);
const IconWarning = ({ size = 18 }) => svg(size, <><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>);
const IconLayers = ({ size = 20 }) => svg(size, <><path d="m12 2 10 5.5-10 5.5L2 7.5 12 2Z" /><path d="m2 12 10 5.5 10-5.5" /><path d="m2 16.5 10 5.5 10-5.5" /></>);
const IconClock = ({ size = 20 }) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>);
const IconCheckCircle = ({ size = 44 }) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>);
const IconInfo = ({ size = 16 }) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
const IconDownload = ({ size = 18 }) => svg(size, <><path d="M12 3v12" /><path d="m7 10.5 5 5 5-5" /><path d="M5 21h14" /></>);
const IconPuzzle = ({ size = 20 }) => svg(size, <path d="M14.5 3.5a2 2 0 1 1 3.8.9h1.7a1 1 0 0 1 1 1v3.1a2 2 0 1 0 0 3.8v3.1a1 1 0 0 1-1 1h-3.1a2 2 0 1 1-3.8 0H10a1 1 0 0 1-1-1v-3.1a2 2 0 1 0 0-3.8V5.4a1 1 0 0 1 1-1h3.1a2 2 0 0 1 .4-1Z" />);

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
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

  // Apply the theme. We only PERSIST on an explicit toggle (see toggleTheme) so
  // a first-load default derived from the OS doesn't pin the app against later
  // OS light/dark changes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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

  function toggleTheme() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
      return next;
    });
  }

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
        setError("We couldn't start the scan. Make sure the Duplicate Finder backend is running and reachable, then try again.");
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
        setError("We couldn't begin scanning. Check that the backend is running and reachable, then click Done selecting again.");
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
          setError(`The scan hit a snag. ${data.error || 'Something went wrong'}. Give it another try — if it keeps happening, restart the backend.`);
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
          setError("We lost the connection mid-scan. Make sure the backend is still running, then start a new scan.");
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
        <h1 className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="7" y="6" width="12" height="12" rx="3" fill="currentColor" opacity="0.5" />
              <rect x="4" y="9" width="12" height="11" rx="3" fill="currentColor" />
            </svg>
          </span>
          <span className="brand__name">Duplicate <b>Finder</b></span>
        </h1>
        <button
          type="button"
          className="theme-toggle"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Dark theme"
          onClick={toggleTheme}
        >
          <span className="theme-toggle__thumb" aria-hidden="true">{theme === 'dark' ? <IconMoon size={15} /> : <IconSun size={15} />}</span>
        </button>
      </header>

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
          <div className="idle">
            <section className="hero">
              <h2 className="hero__title">Your library, <em>minus the doubles.</em></h2>
              <p className="hero__sub">Scan your Google Photos, review the duplicates and look-alikes we find, and clear the clutter — one keeper stays, every time.</p>
              <button type="button" className="btn btn--primary btn--lg" onClick={handleScan}>
                <IconScan size={18} /> Scan my photos
              </button>
              <p className="hero__reassure">Nothing is deleted until you say so. Deletions go to your Google Photos trash, so they're recoverable.</p>

              <div className="demo" role="img" aria-label="Animation: three duplicate photos are grouped, one is kept, and the extras are removed, leaving a single photo.">
                <div className="demo__stage" aria-hidden="true">
                  <div className="demo__tile extra e1" />
                  <div className="demo__tile keeper"><span className="demo__badge"><IconCheck size={15} /></span></div>
                  <div className="demo__tile extra e2" />
                  <span className="demo__pill">Deleted ✓</span>
                </div>
                <p className="demo__caption" aria-hidden="true">Keep one — delete the rest.</p>
              </div>
            </section>

            <section className="how" aria-labelledby="how-title">
              <p className="eyebrow">How it works</p>
              <h2 className="how__title" id="how-title">Six steps to a cleaner library</h2>
              <ol className="steps">
                {STEPS.map((s, i) => (
                  <li className="step" key={i}>
                    <span className="step__num" aria-hidden="true">{i + 1}</span>
                    <h3 className="step__title">{s.title}</h3>
                    <p className="step__desc">{s.desc}</p>
                  </li>
                ))}
              </ol>

              <div className="callout">
                <span className="callout__icon"><IconLayers size={20} /></span>
                <div>
                  <p className="callout__title">Got more than 2,000 photos?</p>
                  <p className="callout__body">Google Photos lets us pick up to <b>2,000 photos per scan</b>. To clean a larger library, work in batches: scan your first 2,000, delete the duplicates, then hit <b>Scan my photos</b> again and pick the next 2,000. Repeat until you've covered everything.</p>
                  <p className="callout__tip">Tip: go album by album, or oldest-to-newest, so you always know where you left off.</p>
                </div>
              </div>

              <div className="callout callout--time">
                <span className="callout__icon"><IconClock size={20} /></span>
                <div>
                  <p className="callout__title">Deletion runs hands-free — leave it be</p>
                  <p className="callout__body">Each photo is removed one at a time in the background, so a large batch can take a while. Once it starts, <b>don't touch your computer</b> — no clicking, switching tabs, or letting it sleep — until it finishes, or some photos may be skipped.</p>
                  <p className="callout__tip">Deleting a big batch? Kick it off before bed and let it run overnight.</p>
                </div>
              </div>
            </section>

            <section className="setup" aria-labelledby="setup-title">
              <div className="setup__card">
                <div className="setup__head">
                  <span className="setup__badge" aria-hidden="true"><IconPuzzle size={22} /></span>
                  <p className="eyebrow">One-time setup</p>
                  <h2 id="setup-title" className="setup__title">Install the deletion helper</h2>
                  <p className="setup__lead">Finding duplicates works right away. To actually <b>delete</b> them, add our small Chrome extension — it moves the photos you pick to your Google Photos trash. You only do this once.</p>
                  <a className="btn btn--primary btn--lg" href={`${process.env.PUBLIC_URL}/duplicate-finder-extension.zip`} download>
                    <IconDownload size={18} /> Download the extension
                  </a>
                  <p className="setup__note">Works in Chrome and Chrome-based browsers (Edge, Brave, Arc).</p>
                </div>

                <ol className="install-steps">
                  <li><b>Download &amp; unzip.</b> Click the button above, then unzip the file. You'll get a folder named <code>duplicate-finder-extension</code>.</li>
                  <li><b>Open the extensions page.</b> Type or paste <code>chrome://extensions</code> into your browser's address bar and press Enter.</li>
                  <li><b>Turn on Developer mode.</b> Flip the <b>Developer mode</b> switch in the top-right corner of that page.</li>
                  <li><b>Load the folder.</b> Click <b>Load unpacked</b> and select the <code>duplicate-finder-extension</code> folder you just unzipped.</li>
                  <li><b>You're set.</b> "Google Photos Deleter" appears in your list — leave it enabled. The <b>Delete</b> buttons here will now work.</li>
                </ol>

                <p className="setup__foot">Keep the unzipped folder somewhere permanent — if you move or delete it, the extension stops working. Prefer not to install anything? You can still scan and review duplicates; you just won't be able to delete from here.</p>
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
                <div className="empty__icon"><IconCheckCircle size={44} /></div>
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
