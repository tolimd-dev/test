// DPC Workflow Observer - Background Service Worker
// All data stays in chrome.storage.local — nothing leaves your device.

// ---------------------------------------------------------------------------
// Tool definitions — add/edit via the Options page
// ---------------------------------------------------------------------------
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
  // CPL and Envision URLs — update in Options if different
  { pattern: 'portal.cpllabs.com',          name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'cplabs.com',                  name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'envisionradiology.com',       name: 'Envision',      category: 'imaging'         },
  { pattern: 'envisionimaging.com',         name: 'Envision',      category: 'imaging'         },
];

// Minimum time on a tab to be worth logging (ms)
const MIN_DURATION_MS = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTools() {
  const result = await chrome.storage.local.get(['customTools']);
  return result.customTools || DEFAULT_TOOLS;
}

function identifyTool(url, tools) {
  if (!url) return null;
  let hostname, pathname;
  try {
    const u = new URL(url);
    hostname = u.hostname;
    pathname = u.pathname;
  } catch {
    return null;
  }

  const fullPath = hostname + pathname;
  for (const tool of tools) {
    if (
      fullPath.startsWith(tool.pattern) ||
      hostname === tool.pattern ||
      hostname.endsWith('.' + tool.pattern)
    ) {
      return { name: tool.name, category: tool.category, pattern: tool.pattern };
    }
  }
  return null;
}

// Extract patient name from a Google Doc title.
// Expected formats: "LastName.FirstName" or "LastName.FirstName - Chart" etc.
function extractPatient(title) {
  if (!title) return null;
  const match = title.match(/\b([A-Z][a-zA-Z'-]+\.[A-Z][a-zA-Z'-]+)\b/);
  return match ? match[1] : null;
}

function todayDateString() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

async function logActivity(entry) {
  const result = await chrome.storage.local.get(['activityLog']);
  const log = result.activityLog || [];
  log.push(entry);

  // Retain 60 days
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const trimmed = log.filter(e => new Date(e.startTime).getTime() > cutoff);

  await chrome.storage.local.set({ activityLog: trimmed });
}

// ---------------------------------------------------------------------------
// Tab state
// ---------------------------------------------------------------------------

let activeTabId   = null;
let activeStart   = null;   // ms timestamp
let activeInfo    = null;   // { url, title, tool, patient, startTime ISO }

async function snapshotTab(tabId) {
  if (tabId === null || tabId === undefined) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    const tools = await getTools();
    const tool  = identifyTool(tab.url, tools);
    const patient = extractPatient(tab.title);
    return {
      url:       tab.url,
      title:     tab.title,
      tool,
      patient,
      startTime: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function flushActive(endTime) {
  if (!activeInfo || !activeStart) return;
  const duration = (endTime || Date.now()) - activeStart;
  if (duration < MIN_DURATION_MS) return;

  await logActivity({
    id:        `${activeStart}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: activeInfo.startTime,
    endTime:   new Date(endTime || Date.now()).toISOString(),
    duration:  Math.round(duration / 1000), // seconds
    url:       activeInfo.url,
    title:     activeInfo.title,
    tool:      activeInfo.tool,
    patient:   activeInfo.patient,
    date:      todayDateString(),
    note:      null,
  });
}

async function switchToTab(newTabId) {
  const now = Date.now();
  await flushActive(now);

  activeTabId = newTabId;
  activeStart = now;
  activeInfo  = newTabId !== null ? await snapshotTab(newTabId) : null;
}

// ---------------------------------------------------------------------------
// Chrome event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await switchToTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status !== 'complete') return;

  // URL changed within same tab — flush old, start new
  const now = Date.now();
  await flushActive(now);
  activeStart = now;
  activeInfo  = await snapshotTab(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flushActive();
  activeTabId = null;
  activeStart = null;
  activeInfo  = null;
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — flush and pause timer
    await flushActive();
    activeStart = null; // paused
  } else {
    // Browser regained focus — resume timer
    if (activeTabId !== null) {
      activeStart = Date.now();
      // Refresh tab snapshot in case things changed
      activeInfo = await snapshotTab(activeTabId);
    }
  }
});

// ---------------------------------------------------------------------------
// Message API (used by popup + dashboard)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === 'GET_CURRENT') {
    sendResponse({
      tool:    activeInfo?.tool    ?? null,
      patient: activeInfo?.patient ?? null,
      title:   activeInfo?.title   ?? null,
      url:     activeInfo?.url     ?? null,
    });
    return true;
  }

  if (message.type === 'GET_LOG') {
    chrome.storage.local.get(['activityLog'], (result) => {
      const log = result.activityLog || [];
      const filtered = message.date
        ? log.filter(e => e.date === message.date)
        : log;
      sendResponse({ log: filtered });
    });
    return true;
  }

  if (message.type === 'UPDATE_ENTRY') {
    chrome.storage.local.get(['activityLog'], (result) => {
      const log = result.activityLog || [];
      const idx = log.findIndex(e => e.id === message.id);
      if (idx !== -1) {
        if (message.note    !== undefined) log[idx].note    = message.note;
        if (message.patient !== undefined) log[idx].patient = message.patient;
      }
      chrome.storage.local.set({ activityLog: log }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (message.type === 'CLEAR_LOG') {
    chrome.storage.local.set({ activityLog: [] }, () => sendResponse({ success: true }));
    return true;
  }
});
