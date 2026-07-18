document.getElementById('deleteBtn').addEventListener('click', async () => {
  const filename = document.getElementById('filename').value.trim();
  const status = document.getElementById('status');
  if (!filename) { status.textContent = 'Enter a filename'; return; }

  status.textContent = '🔍 Searching...';
  document.getElementById('deleteBtn').disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'deletePhoto', filename }, (res) => {
    status.textContent = res?.message || '❌ No response';
    document.getElementById('deleteBtn').disabled = false;
  });
});