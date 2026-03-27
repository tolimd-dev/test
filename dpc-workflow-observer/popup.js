// popup.js — runs inside popup.html

const today = new Date().toLocaleDateString('en-CA');

// Get current tab context
chrome.runtime.sendMessage({ type: 'GET_CURRENT' }, (res) => {
  if (!res) return;

  const toolEl    = document.getElementById('current-tool');
  const patientEl = document.getElementById('current-patient');

  if (res.tool) {
    toolEl.innerHTML = `<span class="badge">${res.tool.category}</span> &nbsp;${res.tool.name}`;
  }

  if (res.patient) {
    const [last, first] = res.patient.split('.');
    patientEl.textContent = first ? `${first} ${last}` : res.patient;
  }
});

// Get today's stats
chrome.runtime.sendMessage({ type: 'GET_LOG', date: today }, (res) => {
  if (!res || !res.log) return;

  const log      = res.log;
  const patients = new Set(log.map(e => e.patient).filter(Boolean));
  const tools    = new Set(log.map(e => e.tool?.name).filter(Boolean));

  document.getElementById('stat-events').textContent   = log.length;
  document.getElementById('stat-patients').textContent = patients.size;
  document.getElementById('stat-tools').textContent    = tools.size;
});

document.getElementById('btn-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  window.close();
});

document.getElementById('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
