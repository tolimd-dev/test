// options.js

const DEFAULT_TOOLS = [
  { pattern: 'docs.google.com/document',    name: 'Google Docs',   category: 'chart'          },
  { pattern: 'docs.google.com/spreadsheet', name: 'Google Sheets', category: 'reference'       },
  { pattern: 'mail.google.com',             name: 'Gmail',         category: 'communication'   },
  { pattern: 'drive.google.com',            name: 'Google Drive',  category: 'storage'         },
  { pattern: 'app.sprucehealth.com',        name: 'Spruce',        category: 'communication'   },
  { pattern: 'www.doximity.com',            name: 'Doximity',      category: 'fax'             },
  { pattern: 'dialer.doximity.com',         name: 'Doximity',      category: 'fax'             },
  { pattern: 'calendly.com',                name: 'Calendly',      category: 'scheduling'      },
  { pattern: 'app.iprescribe.com',          name: 'iPrescribe',    category: 'prescriptions'   },
  { pattern: 'portal.cpllabs.com',          name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'cplabs.com',                  name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'envisionradiology.com',       name: 'Envision',      category: 'imaging'         },
  { pattern: 'envisionimaging.com',         name: 'Envision',      category: 'imaging'         },
];

const CATEGORIES = [
  'chart', 'communication', 'labs', 'imaging', 'fax',
  'scheduling', 'prescriptions', 'reference', 'storage',
];

const DEFAULT_REGEX = String.raw`\b([A-Z][a-zA-Z'\-]+\.[A-Z][a-zA-Z'\-]+)\b`;

// ---------------------------------------------------------------------------
// Render tool table
// ---------------------------------------------------------------------------

function categoryOptions(selected) {
  return CATEGORIES.map(c =>
    `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function renderToolRow(tool) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="col-pattern" value="${escHtml(tool.pattern)}" placeholder="hostname/path" /></td>
    <td><input type="text" class="col-name"    value="${escHtml(tool.name)}"    placeholder="Display name" /></td>
    <td>
      <select class="col-category">${categoryOptions(tool.category)}</select>
    </td>
    <td><button class="del-btn" title="Remove">&#x2715;</button></td>
  `;
  tr.querySelector('.del-btn').addEventListener('click', () => tr.remove());
  return tr;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function readToolsFromTable() {
  return [...document.querySelectorAll('#tool-body tr')].map(tr => ({
    pattern:  tr.querySelector('.col-pattern').value.trim(),
    name:     tr.querySelector('.col-name').value.trim(),
    category: tr.querySelector('.col-category').value,
  })).filter(t => t.pattern && t.name);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------
// Load settings
// ---------------------------------------------------------------------------

function loadSettings() {
  chrome.storage.local.get(['customTools', 'patientRegex'], (result) => {
    const tools = result.customTools || DEFAULT_TOOLS;
    const regex = result.patientRegex || DEFAULT_REGEX;

    const tbody = document.getElementById('tool-body');
    tbody.innerHTML = '';
    tools.forEach(t => tbody.appendChild(renderToolRow(t)));

    document.getElementById('patient-regex').value = regex;
  });
}

// ---------------------------------------------------------------------------
// Save settings
// ---------------------------------------------------------------------------

function saveSettings() {
  const tools = readToolsFromTable();
  const regex = document.getElementById('patient-regex').value.trim() || DEFAULT_REGEX;

  // Validate regex
  try { new RegExp(regex); } catch {
    showToast('Invalid regex — please fix it before saving.');
    return;
  }

  chrome.storage.local.set({ customTools: tools, patientRegex: regex }, () => {
    showToast('Settings saved.');
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('btn-add-tool').addEventListener('click', () => {
    const tbody = document.getElementById('tool-body');
    tbody.appendChild(renderToolRow({ pattern: '', name: '', category: 'chart' }));
    tbody.lastElementChild.querySelector('.col-pattern').focus();
  });

  document.getElementById('btn-save').addEventListener('click', saveSettings);

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset all tool settings to defaults?')) return;
    const tbody = document.getElementById('tool-body');
    tbody.innerHTML = '';
    DEFAULT_TOOLS.forEach(t => tbody.appendChild(renderToolRow(t)));
    document.getElementById('patient-regex').value = DEFAULT_REGEX;
    showToast('Reset to defaults — click Save to apply.');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Delete all recorded activity data? This cannot be undone.')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_LOG' }, () => {
      showToast('Activity data cleared.');
    });
  });
});
