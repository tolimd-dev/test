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
  { pattern: 'portal.cpllabs.com',          name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'cplabs.com',                  name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'envisionradiology.com',       name: 'Envision',      category: 'imaging'         },
  { pattern: 'envisionimaging.com',         name: 'Envision',      category: 'imaging'         },
];

const CATEGORIES = ['chart','communication','labs','imaging','fax','scheduling','prescriptions','reference','storage'];
const DEFAULT_REGEX = String.raw`\b([A-Z][a-zA-Z'\-]+\.[A-Z][a-zA-Z'\-]+)\b`;

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = isError ? 'show error' : 'show';
  setTimeout(() => el.className = '', 2500);
}

// ---------------------------------------------------------------------------
// Tool table
// ---------------------------------------------------------------------------

function catOptions(selected) {
  return CATEGORIES.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderToolRow(t) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="col-pattern" value="${esc(t.pattern)}" placeholder="hostname/path" /></td>
    <td><input type="text" class="col-name"    value="${esc(t.name)}"    placeholder="Display name" /></td>
    <td><select class="col-cat">${catOptions(t.category)}</select></td>
    <td><button class="del-btn" title="Remove">&#x2715;</button></td>`;
  tr.querySelector('.del-btn').addEventListener('click', () => tr.remove());
  return tr;
}

function readTools() {
  return [...document.querySelectorAll('#tool-body tr')].map(tr => ({
    pattern:  tr.querySelector('.col-pattern').value.trim(),
    name:     tr.querySelector('.col-name').value.trim(),
    category: tr.querySelector('.col-cat').value,
  })).filter(t => t.pattern && t.name);
}

// ---------------------------------------------------------------------------
// API key UI
// ---------------------------------------------------------------------------

function setKeyStatus(state, message) {
  const dot  = document.getElementById('key-dot');
  const text = document.getElementById('key-status-text');
  dot.className  = `status-dot ${state}`;
  text.textContent = message;
}

document.getElementById('toggle-key').addEventListener('click', () => {
  const input = document.getElementById('api-key');
  const btn   = document.getElementById('toggle-key');
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
});

document.getElementById('test-key-btn').addEventListener('click', async () => {
  const key = document.getElementById('api-key').value.trim();
  if (!key) { toast('Enter an API key first.', true); return; }

  setKeyStatus('', 'Testing…');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (res.ok) {
      setKeyStatus('valid', 'Connected ✓');
      toast('API key is valid.');
    } else {
      const err = await res.json().catch(() => ({}));
      setKeyStatus('invalid', `Error: ${err.error?.message || res.status}`);
      toast('Key test failed — check the key and try again.', true);
    }
  } catch {
    setKeyStatus('invalid', 'Connection failed');
    toast('Could not reach API — check your connection.', true);
  }
});

// ---------------------------------------------------------------------------
// Load settings
// ---------------------------------------------------------------------------

function load() {
  chrome.storage.local.get(['customTools', 'patientRegex', 'claudeApiKey', 'wrenChatModel'], r => {
    const tools  = r.customTools   || DEFAULT_TOOLS;
    const regex  = r.patientRegex  || DEFAULT_REGEX;
    const key    = r.claudeApiKey  || '';
    const model  = r.wrenChatModel || 'claude-haiku-4-5-20251001';

    const tbody = document.getElementById('tool-body');
    tbody.innerHTML = '';
    tools.forEach(t => tbody.appendChild(renderToolRow(t)));

    document.getElementById('patient-regex').value = regex;
    document.getElementById('api-key').value        = key;
    document.getElementById('wren-model').value     = model;

    if (key) setKeyStatus('', 'Key saved — click Test to verify');
    else     setKeyStatus('', 'Not configured');
  });
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

function save() {
  const tools = readTools();
  const regex = document.getElementById('patient-regex').value.trim() || DEFAULT_REGEX;
  const key   = document.getElementById('api-key').value.trim();

  try { new RegExp(regex); } catch {
    toast('Invalid regex — fix it before saving.', true);
    return;
  }

  const model = document.getElementById('wren-model').value;
  const data  = { customTools: tools, patientRegex: regex, wrenChatModel: model };
  if (key) data.claudeApiKey = key;
  else     data.claudeApiKey = '';

  chrome.storage.local.set(data, () => toast('Settings saved.'));
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  load();

  document.getElementById('btn-add').addEventListener('click', () => {
    const tbody = document.getElementById('tool-body');
    tbody.appendChild(renderToolRow({ pattern: '', name: '', category: 'chart' }));
    tbody.lastElementChild.querySelector('.col-pattern').focus();
  });

  document.getElementById('btn-save').addEventListener('click', save);

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset tool list to defaults?')) return;
    const tbody = document.getElementById('tool-body');
    tbody.innerHTML = '';
    DEFAULT_TOOLS.forEach(t => tbody.appendChild(renderToolRow(t)));
    toast('Reset — click Save to apply.');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Delete all recorded activity and suggestions? This cannot be undone.')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_LOG' }, () => toast('All data cleared.'));
  });
});
