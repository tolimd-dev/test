// dashboard.js

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDur(s) {
  if (!s) return '';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  return sec ? `${m}m ${sec}s` : `${m}m`;
}

function fmtName(raw) {
  if (!raw) return null;
  const [last, first] = raw.split('.');
  return first ? `${first} ${last}` : raw;
}

function chipClass(cat) {
  return `chip-${cat || 'unknown'}`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function todayStr() { return new Date().toLocaleDateString('en-CA'); }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let activityLog  = [];
let currentView  = 'suggestions';
let activityDate = todayStr();

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;

    document.getElementById('view-suggestions').classList.toggle('hidden', currentView !== 'suggestions');
    document.getElementById('view-activity').classList.toggle('hidden',    currentView !== 'activity');
    document.getElementById('view-timeline').classList.toggle('hidden',    currentView !== 'timeline');

    if (currentView === 'activity' || currentView === 'timeline') loadActivity(activityDate);
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

function loadSuggestions() {
  chrome.runtime.sendMessage({ type: 'GET_SUGGESTIONS' }, ({ suggestions, lastAnalyzed }) => {
    renderSuggestions(suggestions || [], lastAnalyzed);
  });
}

function renderSuggestions(suggestions, lastAnalyzed) {
  const meta  = document.getElementById('analysis-meta');
  const badge = document.getElementById('badge-count');
  const list  = document.getElementById('suggestions-list');

  if (lastAnalyzed) {
    const when = new Date(lastAnalyzed).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    meta.textContent = `Last analyzed: ${when}`;
  } else {
    meta.textContent = 'Not yet analyzed — click "Analyze my workflow" to start.';
  }

  if (suggestions.length > 0) {
    badge.textContent = suggestions.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (suggestions.length === 0 && !lastAnalyzed) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h2>Nothing to suggest yet</h2>
        <p>Use your clinical tools normally for a bit — open patient charts, check labs, send faxes. Once there's enough data, click <strong>Analyze my workflow</strong> and it will identify what to automate based on what you actually do.</p>
        <p style="margin-top:12px; font-size:12px; color:#94a3b8;">No Claude API key needed for the first suggestions. Deeper analysis is available if you add one in Settings.</p>
      </div>`;
    return;
  }

  if (suggestions.length === 0 && lastAnalyzed) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <h2>No automation opportunities found yet</h2>
        <p>Work normally for a few more days and re-analyze. Patterns need a few repetitions before they show up as suggestions.</p>
      </div>`;
    return;
  }

  list.innerHTML = suggestions.map(s => buildSuggestionCard(s)).join('');

  // Wire up buttons
  list.querySelectorAll('.build-btn').forEach(btn => {
    btn.addEventListener('click', () => openBuildPanel(btn.dataset.type, btn.dataset.title));
  });

  list.querySelectorAll('.dismiss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DISMISS_SUGGESTION', id: btn.dataset.id }, () => loadSuggestions());
    });
  });
}

function buildSuggestionCard(s) {
  const complexityClass = `complexity-${s.complexity || 'low'}`;
  const sourceLabel     = s.source === 'ai' ? 'AI insight' : 'Pattern match';
  const sourceClass     = s.source === 'ai' ? 'ai' : '';

  return `
    <div class="suggestion-card ${complexityClass}">
      <div class="card-top">
        <span class="card-icon">${esc(s.icon || '⚙️')}</span>
        <div class="card-title">${esc(s.title)}</div>
        <div class="card-badges">
          <span class="complexity-badge ${complexityClass}">${esc(s.complexity || 'low')}</span>
          <span class="source-badge ${sourceClass}">${sourceLabel}</span>
        </div>
      </div>
      <p class="card-description">${esc(s.description)}</p>
      <p class="card-benefit">→ ${esc(s.benefit)}</p>
      <div class="card-actions">
        <button class="build-btn" data-type="${esc(s.automationType)}" data-title="${esc(s.title)}">Build this →</button>
        <button class="dismiss-btn" data-id="${esc(s.id)}">Dismiss</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Build panel
// ---------------------------------------------------------------------------

function openBuildPanel(automationType, title) {
  chrome.runtime.sendMessage({ type: 'GET_BUILD', automationType }, ({ code }) => {
    if (!code) return;

    document.getElementById('panel-title').textContent = code.title || title;

    const stepsList = document.getElementById('panel-steps-list');
    stepsList.innerHTML = (code.instructions || []).map(s => `<li>${esc(s)}</li>`).join('');

    document.getElementById('panel-code-pre').textContent = code.code || '';

    document.getElementById('build-panel').classList.add('open');
    document.getElementById('overlay').classList.add('open');
  });
}

function closeBuildPanel() {
  document.getElementById('build-panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

document.getElementById('panel-close').addEventListener('click', closeBuildPanel);
document.getElementById('overlay').addEventListener('click', closeBuildPanel);

document.getElementById('copy-btn').addEventListener('click', () => {
  const code = document.getElementById('panel-code-pre').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy code'; btn.classList.remove('copied'); }, 2000);
  });
});

// ---------------------------------------------------------------------------
// Analyze button
// ---------------------------------------------------------------------------

document.getElementById('analyze-btn').addEventListener('click', () => {
  const btn = document.getElementById('analyze-btn');
  btn.classList.add('loading');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Analyzing…';

  chrome.runtime.sendMessage({ type: 'RUN_ANALYSIS' }, ({ suggestions, lastAnalyzed }) => {
    renderSuggestions(suggestions || [], lastAnalyzed);
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Analyze my workflow';
  });
});

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

function loadActivity(date) {
  chrome.runtime.sendMessage({ type: 'GET_LOG', date }, ({ log }) => {
    activityLog = log || [];
    if (currentView === 'activity')  renderActivity(activityLog);
    if (currentView === 'timeline')  renderTimeline(activityLog);
  });
}

function renderActivity(log) {
  const list = document.getElementById('activity-list');

  const patients = new Set(log.map(e => e.patient).filter(Boolean));
  const tools    = new Set(log.map(e => e.tool?.name).filter(Boolean));
  const totalSec = log.reduce((a, e) => a + (e.duration || 0), 0);

  document.getElementById('s-events').textContent   = log.length;
  document.getElementById('s-patients').textContent = patients.size;
  document.getElementById('s-tools').textContent    = tools.size;
  document.getElementById('s-time').textContent     = fmtDur(totalSec) || '0m';

  if (log.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h2>No activity for this date</h2><p>Use your clinical tools and activity will appear here.</p></div>`;
    return;
  }

  // Group by patient
  const groups = {};
  const unassigned = [];

  for (const e of log) {
    if (e.patient) {
      if (!groups[e.patient]) groups[e.patient] = [];
      groups[e.patient].push(e);
    } else if (e.tool) {
      unassigned.push(e);
    }
  }

  let html = '';

  for (const [raw, entries] of Object.entries(groups)) {
    const name    = fmtName(raw);
    const totalS  = entries.reduce((a, e) => a + (e.duration || 0), 0);
    const toolSet = [...new Set(entries.map(e => e.tool).filter(Boolean))];
    const chips   = toolSet.map(t => `<span class="chip ${chipClass(t.category)}">${esc(t.name)}</span>`).join('');
    const rows    = entries.map(e => entryRow(e)).join('');

    html += `
      <div class="patient-section">
        <div class="patient-header">
          <div><div class="patient-name">${esc(name)}</div><div style="margin-top:4px">${chips}</div></div>
          <div class="patient-meta"><span>${entries.length} events</span><span>${fmtDur(totalS)}</span></div>
        </div>
        <div class="entries">${rows}</div>
      </div>`;
  }

  if (unassigned.length > 0) {
    html += `
      <div class="patient-section">
        <div class="patient-header" style="border-left-color:#94a3b8">
          <div class="patient-name" style="color:#64748b">Unassigned activity</div>
        </div>
        <div class="entries">${unassigned.map(e => entryRow(e)).join('')}</div>
      </div>`;
  }

  list.innerHTML = html;
  attachNoteHandlers(list);
}

function entryRow(e) {
  const toolName = e.tool?.name || '—';
  const cat      = e.tool?.category || 'unknown';
  const noteHtml = e.note ? `<div class="entry-note">${esc(e.note)}</div>` : '';

  return `
    <div class="entry" data-id="${esc(e.id)}">
      <div class="entry-time">${fmtTime(e.startTime)}</div>
      <div><span class="chip ${chipClass(cat)}">${esc(toolName)}</span></div>
      <div class="entry-title" title="${esc(e.title || e.url || '')}">${esc(e.title || e.url || '—')}${noteHtml}</div>
      <div class="entry-dur">${fmtDur(e.duration)}</div>
      <button class="note-btn" data-id="${esc(e.id)}">${e.note ? 'edit' : '+ note'}</button>
    </div>`;
}

function attachNoteHandlers(container) {
  container.querySelectorAll('.note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.note-row').forEach(r => r.remove());
      const id      = btn.dataset.id;
      const entryEl = container.querySelector(`.entry[data-id="${id}"]`);
      const entry   = activityLog.find(e => e.id === id);
      if (!entryEl || !entry) return;

      const row = document.createElement('div');
      row.className = 'note-row';
      row.innerHTML = `
        <textarea placeholder="What were you doing? (e.g. ordered TSH — fatigue workup)">${esc(entry.note || '')}</textarea>
        <div class="note-actions">
          <button class="note-cancel">Cancel</button>
          <button class="note-save">Save</button>
        </div>`;
      entryEl.insertAdjacentElement('afterend', row);
      row.querySelector('textarea').focus();
      row.querySelector('.note-cancel').addEventListener('click', () => row.remove());
      row.querySelector('.note-save').addEventListener('click', () => {
        const note = row.querySelector('textarea').value.trim();
        chrome.runtime.sendMessage({ type: 'UPDATE_ENTRY', id, note }, () => {
          entry.note = note;
          renderActivity(activityLog);
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function renderTimeline(log) {
  const container = document.getElementById('timeline-list');

  if (log.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⏱️</div><h2>No activity for this date</h2></div>`;
    return;
  }

  const sorted = [...log].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  container.innerHTML = sorted.map(e => {
    const toolName    = e.tool?.name || 'Unknown';
    const cat         = e.tool?.category || 'unknown';
    const patientName = fmtName(e.patient);

    return `
      <div class="tl-entry">
        <div class="tl-time">${fmtTime(e.startTime)}</div>
        <div class="tl-dot"></div>
        <div class="tl-body">
          <div class="tl-top">
            <span class="chip ${chipClass(cat)}">${esc(toolName)}</span>
            ${patientName ? `<span class="tl-patient">${esc(patientName)}</span>` : ''}
            <span class="tl-dur">${fmtDur(e.duration)}</span>
          </div>
          <div class="tl-title">${esc(e.title || e.url || '—')}</div>
          ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

document.getElementById('btn-export').addEventListener('click', () => {
  const rows = [
    ['Date','Start','End','Duration(s)','Tool','Category','Patient','Title','Note'],
    ...activityLog.map(e => [
      e.date || '',
      e.startTime || '',
      e.endTime || '',
      e.duration || 0,
      e.tool?.name || '',
      e.tool?.category || '',
      fmtName(e.patient) || '',
      e.title || e.url || '',
      e.note || '',
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `dpc-${document.getElementById('date-picker').value}.csv`,
  });
  a.click();
});

// ---------------------------------------------------------------------------
// Date pickers
// ---------------------------------------------------------------------------

document.getElementById('date-picker').value    = todayStr();
document.getElementById('date-picker-tl').value = todayStr();

document.getElementById('date-picker').addEventListener('change', e => {
  activityDate = e.target.value;
  document.getElementById('date-picker-tl').value = activityDate;
  loadActivity(activityDate);
});

document.getElementById('date-picker-tl').addEventListener('change', e => {
  activityDate = e.target.value;
  document.getElementById('date-picker').value = activityDate;
  loadActivity(activityDate);
});

// ---------------------------------------------------------------------------
// Settings button
// ---------------------------------------------------------------------------

document.getElementById('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadSuggestions();
