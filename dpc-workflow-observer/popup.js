// popup.js

const today = new Date().toLocaleDateString('en-CA');

// Current tab context
chrome.runtime.sendMessage({ type: 'GET_CURRENT' }, res => {
  if (!res) return;

  if (res.tool) {
    document.getElementById('current-tool').innerHTML =
      `<span class="badge">${res.tool.category}</span>&nbsp; ${res.tool.name}`;
  }

  if (res.patient) {
    const [last, first] = res.patient.split('.');
    document.getElementById('current-patient').textContent = first ? `${first} ${last}` : res.patient;
  }
});

// Today's stats
chrome.runtime.sendMessage({ type: 'GET_LOG', date: today }, res => {
  if (!res?.log) return;
  const log      = res.log;
  const patients = new Set(log.map(e => e.patient).filter(Boolean));
  const tools    = new Set(log.map(e => e.tool?.name).filter(Boolean));
  document.getElementById('s-events').textContent   = log.length;
  document.getElementById('s-patients').textContent = patients.size;
  document.getElementById('s-tools').textContent    = tools.size;
});

// Wren unread banner
chrome.runtime.sendMessage({ type: 'WREN_GET_HISTORY' }, res => {
  if (!res?.hasUnread) return;
  const banner = document.getElementById('wren-banner');
  banner.classList.remove('hidden');

  // Show a preview of Wren's last message
  const last = (res.history || []).filter(m => m.role === 'assistant').slice(-1)[0];
  if (last) {
    const preview = last.content.slice(0, 60) + (last.content.length > 60 ? '…' : '');
    document.getElementById('wren-preview').textContent = preview;
  }

  banner.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + '#wren' });
    window.close();
  });
});

// Suggestions banner
chrome.runtime.sendMessage({ type: 'GET_SUGGESTIONS' }, res => {
  const sugs = res?.suggestions || [];
  if (sugs.length === 0) return;

  const banner = document.getElementById('sug-banner');
  banner.classList.remove('hidden');

  document.getElementById('sug-title').textContent =
    `${sugs.length} automation suggestion${sugs.length > 1 ? 's' : ''} ready`;
  document.getElementById('sug-sub').textContent =
    sugs.slice(0,2).map(s => s.title).join(' · ');

  banner.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    window.close();
  });
});

// Buttons
document.getElementById('btn-dash').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  window.close();
});

document.getElementById('btn-opts').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
