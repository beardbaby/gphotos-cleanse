console.log('CONTENT SCRIPT LOADED');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'deletePhoto') {
    run(msg.filename)
      .then(sendResponse)
      .catch(err => sendResponse({ message: '❌ ' + err.message }));
    return true;
  }

  if (msg.action === 'clickFirstPhoto') {
    const tile = [...document.querySelectorAll('[aria-label]')]
      .find(el => el.getAttribute('aria-label').startsWith('Photo'));
    if (tile) {
      tile.click();
    } else {
      alert('❌ No photo found');
    }
  }
});

async function run(filename) {
  chrome.runtime.sendMessage({ action: 'deletePhoto', filename });
  window.location.href = `https://photos.google.com/search/${encodeURIComponent(filename)}`;
  return { message: '🔍 Searching...' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}