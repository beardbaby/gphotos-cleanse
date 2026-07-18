chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'deletePhoto') return;

  const baseName = msg.filename.replace(/\.[^.]+$/, '');
  chrome.tabs.create({
    url: `https://photos.google.com/search/${encodeURIComponent(baseName)}`
  }, (tab) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId !== tab.id || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(() => deletePhoto(tab.id), 800);
    });
  });

  sendResponse({ ok: true });
  return true;
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function executeInTab(tabId, func) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func
    });
    return results?.[0]?.result;
  } catch (e) {
    return null;
  }
}

async function waitFor(tabId, func, interval = 100, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await executeInTab(tabId, func);
    if (result) return true;
    await sleep(interval);
  }
  return false;
}

async function deletePhoto(tabId) {
  // step 1: click photo
  const photoClicked = await waitFor(tabId, () => {
    const tile = [...document.querySelectorAll('[aria-label]')]
      .find(el => el.getAttribute('aria-label').startsWith('Photo'));
    if (tile) { tile.click(); return true; }
    return false;
  });

  if (!photoClicked) { chrome.tabs.remove(tabId); return; }

  // step 2: wait for photo to open then click trash
  await waitFor(tabId, () => window.location.href.includes('/photo/'));

  const trashClicked = await waitFor(tabId, () => {
    const trash = document.querySelector('[aria-label="Move to trash"]');
    if (trash) { trash.click(); return true; }
    return false;
  });

  if (!trashClicked) { chrome.tabs.remove(tabId); return; }

  // step 3: wait for confirm dialog then click
  const confirmed = await waitFor(tabId, () => {
    const confirm = [...document.querySelectorAll('button')]
      .find(b => b.innerText.includes('Move to trash'));
    if (confirm) { confirm.click(); return true; }
    return false;
  });

  if (!confirmed) { chrome.tabs.remove(tabId); return; }

  // step 4: wait for deletion toast/confirmation to appear
  await sleep(3000);  // wait 3 seconds after confirm click
    chrome.tabs.remove(tabId);
  }

// keep popup functionality working
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'deletePhoto') return;
  sendResponse({ message: '🔍 Searching...' });
  deletePhoto(sender.tab.id);
});

// ---------------------------------------------------------------------------
// Batch queue deletion ("select many, delete one-by-one").
// This is ADDITIVE — none of the single-delete code above is touched.
// It opens ONE Google Photos tab at a time, deletes that photo, waits for
// the tab to close, then moves on to the next photo — exactly like the
// single-delete flow, just repeated in sequence.
// ---------------------------------------------------------------------------

// Open a tab for one filename, delete that photo, and resolve only once the
// deletion is fully finished (the tab closes itself inside deletePhoto).
function openAndDelete(filename) {
  return new Promise((resolve) => {
    const baseName = filename.replace(/\.[^.]+$/, '');
    chrome.tabs.create({
      url: `https://photos.google.com/search/${encodeURIComponent(baseName)}`
    }, (tab) => {
      let started = false;
      let fallback;

      const startDeletion = () => {
        if (started) return;      // run the deletion exactly once
        started = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(fallback);
        setTimeout(async () => {
          await deletePhoto(tab.id);   // deletePhoto removes the tab itself
          resolve();
        }, 800);
      };

      function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') startDeletion();
      }

      chrome.tabs.onUpdated.addListener(listener);

      // Safety net: if the page never reports "complete", proceed anyway so
      // one stuck photo can't freeze the whole queue.
      fallback = setTimeout(startDeletion, 15000);
    });
  });
}

// Delete a list of photos strictly one at a time, reporting progress back
// over the port so the web app can show which photo is deleting / done.
async function deletePhotoQueue(items, port) {
  for (const item of items) {
    try { port.postMessage({ type: 'progress', key: item.key, state: 'deleting' }); } catch (e) {}
    await openAndDelete(item.filename);
    try { port.postMessage({ type: 'progress', key: item.key, state: 'done' }); } catch (e) {}
  }
  try { port.postMessage({ type: 'complete' }); } catch (e) {}
  try { port.disconnect(); } catch (e) {}
}

// The web app (localhost:3000) opens a port and posts the selected photos.
chrome.runtime.onConnectExternal.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg && msg.action === 'deletePhotos' && Array.isArray(msg.items)) {
      deletePhotoQueue(msg.items, port);
    }
  });
});