// dashboard.js

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDuration(seconds) {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtPatientName(raw) {
  if (!raw) return null;
  const [last, first] = raw.split('.');
  return first ? `${first} ${last}` : raw;
}

function chipClass(category) {
  const map = {
    chart: 'chip-chart',
    communication: 'chip-communication',
    labs: 'chip-labs',
    imaging: 'chip-imaging',
    fax: 'chip-fax',
    scheduling: 'chip-scheduling',
    prescriptions: 'chip-prescriptions',
    reference: 'chip-reference',
    storage: 'chip-storage',
  };
  return map[category] || 'chip-unknown';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentLog = [];
let currentView = 'patient';

// ---------------------------------------------------------------------------
// Load & render
// ---------------------------------------------------------------------------

function loadLog(date) {
  chrome.runtime.sendMessage({ type: 'GET_LOG', date }, ({ log }) => {
    currentLog = log || [];
    renderSummary(currentLog);
    renderView();
  });
}

function renderSummary(log) {
  const patients = new Set(log.map(e => e.patient).filter(Boolean));
  const tools    = new Set(log.map(e => e.tool?.name).filter(Boolean));
  const totalSec = log.reduce((acc, e) => acc + (e.duration || 0), 0);

  document.getElementById('s-events').textContent   = log.length;
  document.getElementById('s-patients').textContent = patients.size;
  document.getElementById('s-tools').textContent    = tools.size;
  document.getElementById('s-time').textContent     = fmtDuration(totalSec) || '0m';
}

function renderView() {
  if (currentView === 'patient') renderPatientView(currentLog);
  else                           renderTimelineView(currentLog);
}

// ---------------------------------------------------------------------------
// Patient view
// ---------------------------------------------------------------------------

function renderPatientView(log) {
  const container = document.getElementById('view-patient');

  if (log.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <h2>No activity recorded yet</h2>
        <p>Browse your clinical tools and the extension will silently track your workflow. Come back here at end of day to review patterns.</p>
      </div>`;
    return;
  }

  // Group by patient
  const groups = {};
  const unassigned = [];

  for (const entry of log) {
    const key = entry.patient || null;
    if (key) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    } else if (entry.tool) {
      unassigned.push(entry);
    }
  }

  let html = '';

  // Patient sections
  for (const [rawName, entries] of Object.entries(groups)) {
    const displayName = fmtPatientName(rawName);
    const totalSec    = entries.reduce((a, e) => a + (e.duration || 0), 0);
    const toolSet     = [...new Set(entries.map(e => e.tool).filter(Boolean))];

    const chips = toolSet.map(t =>
      `<span class="chip ${chipClass(t.category)}">${escHtml(t.name)}</span>`
    ).join('');

    const entryRows = entries.map(e => buildEntryRow(e)).join('');

    html += `
      <div class="patient-section">
        <div class="patient-header">
          <div>
            <div class="patient-name">${escHtml(displayName)}</div>
            <div class="tool-chips">${chips}</div>
          </div>
          <div class="patient-meta">
            <span>${entries.length} events</span>
            <span>${fmtDuration(totalSec)}</span>
          </div>
        </div>
        <div class="entries" id="entries-${escHtml(rawName)}">
          ${entryRows}
        </div>
      </div>`;
  }

  // Unassigned recognized-tool activity
  if (unassigned.length > 0) {
    const rows = unassigned.map(e => buildEntryRow(e)).join('');
    html += `
      <div class="unassigned-section">
        <h3>Activity without patient context</h3>
        <div class="entries">${rows}</div>
      </div>`;
  }

  container.innerHTML = html;
  attachNoteHandlers(container);
}

function buildEntryRow(e) {
  const toolName = e.tool?.name || 'Unknown';
  const category = e.tool?.category || 'unknown';
  const noteHtml = e.note
    ? `<div class="entry-note">${escHtml(e.note)}</div>`
    : '';

  return `
    <div class="entry" data-id="${escHtml(e.id)}">
      <div class="entry-time">${fmtTime(e.startTime)}</div>
      <div class="entry-tool">
        <span class="chip ${chipClass(category)}">${escHtml(toolName)}</span>
      </div>
      <div style="flex:1; min-width:0;">
        <div class="entry-title" title="${escHtml(e.title || e.url || '')}">${escHtml(e.title || e.url || '—')}</div>
        ${noteHtml}
      </div>
      <div class="entry-duration">${fmtDuration(e.duration)}</div>
      <button class="entry-note-btn" data-id="${escHtml(e.id)}">${e.note ? 'edit note' : '+ note'}</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

function renderTimelineView(log) {
  const container = document.getElementById('view-timeline');

  if (log.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <h2>No activity recorded yet</h2>
        <p>Use your clinical tools and the extension will build a timeline of your day.</p>
      </div>`;
    return;
  }

  const sorted = [...log].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const rows = sorted.map((e, i) => {
    const toolName    = e.tool?.name || 'Unknown';
    const category    = e.tool?.category || 'unknown';
    const displayName = fmtPatientName(e.patient);
    const isLast      = i === sorted.length - 1;

    return `
      <div class="timeline-entry">
        ${!isLast ? '<div class="tl-line"></div>' : ''}
        <div class="tl-time">${fmtTime(e.startTime)}</div>
        <div class="tl-dot"></div>
        <div class="tl-content">
          <div class="tl-header">
            <span class="tl-tool">
              <span class="chip ${chipClass(category)}">${escHtml(toolName)}</span>
            </span>
            ${displayName ? `<span class="tl-patient">${escHtml(displayName)}</span>` : ''}
            <span class="tl-duration">${fmtDuration(e.duration)}</span>
          </div>
          <div class="tl-title" title="${escHtml(e.title || e.url || '')}">${escHtml(e.title || e.url || '—')}</div>
          ${e.note ? `<div class="entry-note">${escHtml(e.note)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div style="padding: 0 4px;">${rows}</div>`;
}

// ---------------------------------------------------------------------------
// Note editing
// ---------------------------------------------------------------------------

function attachNoteHandlers(container) {
  container.querySelectorAll('.entry-note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.id;
      const entryEl = container.querySelector(`.entry[data-id="${id}"]`);
      const entry   = currentLog.find(e => e.id === id);
      if (!entryEl || !entry) return;

      // Remove any existing open note editor
      document.querySelectorAll('.note-row').forEach(r => r.remove());

      const noteRow = document.createElement('div');
      noteRow.className = 'note-row';
      noteRow.innerHTML = `
        <textarea placeholder="What were you doing? (e.g. 'Ordered TSH, CBC — following up on fatigue')">${escHtml(entry.note || '')}</textarea>
        <div class="note-actions">
          <button class="note-cancel">Cancel</button>
          <button class="note-save">Save</button>
        </div>`;

      entryEl.insertAdjacentElement('afterend', noteRow);
      noteRow.querySelector('textarea').focus();

      noteRow.querySelector('.note-cancel').addEventListener('click', () => noteRow.remove());

      noteRow.querySelector('.note-save').addEventListener('click', () => {
        const note = noteRow.querySelector('textarea').value.trim();
        chrome.runtime.sendMessage({ type: 'UPDATE_ENTRY', id, note }, () => {
          entry.note = note;
          renderView(); // re-render to show updated note
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportCSV(log) {
  const rows = [
    ['Date', 'Start Time', 'End Time', 'Duration (s)', 'Tool', 'Category', 'Patient', 'Title', 'Note'],
    ...log.map(e => [
      e.date || '',
      e.startTime || '',
      e.endTime   || '',
      e.duration  || 0,
      e.tool?.name     || '',
      e.tool?.category || '',
      fmtPatientName(e.patient) || '',
      e.title || e.url || '',
      e.note  || '',
    ]),
  ];

  const csv = rows.map(r =>
    r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `dpc-workflow-${document.getElementById('date-picker').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('date-picker');
  const today  = new Date().toLocaleDateString('en-CA');
  picker.value = today;

  loadLog(today);

  picker.addEventListener('change', () => loadLog(picker.value));

  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;

      document.getElementById('view-patient').classList.toggle('hidden',  currentView !== 'patient');
      document.getElementById('view-timeline').classList.toggle('hidden', currentView !== 'timeline');

      renderView();
    });
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    exportCSV(currentLog);
  });
});
