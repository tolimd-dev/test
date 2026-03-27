// DPC Workflow Observer — Background Service Worker
// All activity data stays in chrome.storage.local (never synced, never transmitted without permission).

importScripts('analyzer.js');
importScripts('builder.js');

// ---------------------------------------------------------------------------
// Tool registry (defaults — editable in Options)
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
  { pattern: 'portal.cpllabs.com',          name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'cplabs.com',                  name: 'CPL Labs',      category: 'labs'            },
  { pattern: 'envisionradiology.com',       name: 'Envision',      category: 'imaging'         },
  { pattern: 'envisionimaging.com',         name: 'Envision',      category: 'imaging'         },
];

const MIN_DURATION_MS   = 4000;   // ignore visits < 4s
const SESSION_GAP_MS    = 10 * 60 * 1000; // 10 min inactivity = new session
const MIN_EVENTS_TO_ANALYZE = 5;  // don't analyze with too little data

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTools() {
  const r = await chrome.storage.local.get(['customTools']);
  return r.customTools || DEFAULT_TOOLS;
}

function identifyTool(url, tools) {
  if (!url) return null;
  let hostname, pathname;
  try { const u = new URL(url); hostname = u.hostname; pathname = u.pathname; }
  catch { return null; }
  const full = hostname + pathname;
  for (const t of tools) {
    if (full.startsWith(t.pattern) || hostname === t.pattern || hostname.endsWith('.' + t.pattern))
      return { name: t.name, category: t.category };
  }
  return null;
}

function extractPatient(title) {
  if (!title) return null;
  const m = title.match(/\b([A-Z][a-zA-Z'\-]+\.[A-Z][a-zA-Z'\-]+)\b/);
  return m ? m[1] : null;
}

function todayStr() { return new Date().toLocaleDateString('en-CA'); }

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

async function logActivity(entry) {
  const r   = await chrome.storage.local.get(['activityLog']);
  const log = r.activityLog || [];
  log.push(entry);
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  await chrome.storage.local.set({
    activityLog: log.filter(e => new Date(e.startTime).getTime() > cutoff)
  });
}

// ---------------------------------------------------------------------------
// Tab tracking
// ---------------------------------------------------------------------------

let activeTabId  = null;
let activeStart  = null;
let activeInfo   = null;
let lastActivity = Date.now();

async function snapshotTab(tabId) {
  if (tabId == null) return null;
  try {
    const tab    = await chrome.tabs.get(tabId);
    const tools  = await getTools();
    return {
      url:       tab.url,
      title:     tab.title,
      tool:      identifyTool(tab.url, tools),
      patient:   extractPatient(tab.title),
      startTime: new Date().toISOString(),
    };
  } catch { return null; }
}

async function flushActive(endTime) {
  if (!activeInfo || !activeStart) return;
  const duration = (endTime || Date.now()) - activeStart;
  if (duration < MIN_DURATION_MS) return;

  await logActivity({
    id:        `${activeStart}-${Math.random().toString(36).slice(2,7)}`,
    startTime: activeInfo.startTime,
    endTime:   new Date(endTime || Date.now()).toISOString(),
    duration:  Math.round(duration / 1000),
    url:       activeInfo.url,
    title:     activeInfo.title,
    tool:      activeInfo.tool,
    patient:   activeInfo.patient,
    date:      todayStr(),
    note:      null,
  });

  lastActivity = Date.now();
}

async function switchToTab(newTabId) {
  const now = Date.now();
  const gap  = now - lastActivity;

  // If gap > SESSION_GAP_MS, the previous session ended — trigger analysis
  if (gap > SESSION_GAP_MS) {
    await triggerAnalysis('session_end');
  }

  await flushActive(now);
  activeTabId = newTabId;
  activeStart = now;
  activeInfo  = newTabId != null ? await snapshotTab(newTabId) : null;
}

// ---------------------------------------------------------------------------
// Chrome tab/window events
// ---------------------------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => { await switchToTab(tabId); });

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (tabId !== activeTabId || changeInfo.status !== 'complete') return;
  const now = Date.now();
  await flushActive(now);
  activeStart = now;
  activeInfo  = await snapshotTab(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flushActive();
  activeTabId = null; activeStart = null; activeInfo = null;
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushActive();
    activeStart = null;
  } else {
    if (activeTabId != null) {
      activeStart = Date.now();
      activeInfo  = await snapshotTab(activeTabId);
    }
  }
});

// ---------------------------------------------------------------------------
// Analysis triggering
// ---------------------------------------------------------------------------

async function triggerAnalysis(reason) {
  const r   = await chrome.storage.local.get(['activityLog', 'claudeApiKey', 'lastAnalyzed']);
  const log = r.activityLog || [];

  if (log.length < MIN_EVENTS_TO_ANALYZE) return;

  // Don't re-analyze more than once per hour automatically
  if (reason === 'session_end' && r.lastAnalyzed) {
    const age = Date.now() - new Date(r.lastAnalyzed).getTime();
    if (age < 60 * 60 * 1000) return;
  }

  try {
    const suggestions = await runAnalysis(log, r.claudeApiKey || null);
    await chrome.storage.local.set({
      suggestions,
      lastAnalyzed: new Date().toISOString(),
    });

    // Badge the extension icon with suggestion count
    if (suggestions.length > 0) {
      chrome.action.setBadgeText({ text: String(suggestions.length) });
      chrome.action.setBadgeBackgroundColor({ color: '#1a6b4a' });
    }
  } catch (err) {
    console.error('[DPC Observer] Analysis failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Message API
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'GET_CURRENT') {
    sendResponse({ tool: activeInfo?.tool ?? null, patient: activeInfo?.patient ?? null, title: activeInfo?.title ?? null });
    return true;
  }

  if (msg.type === 'GET_LOG') {
    chrome.storage.local.get(['activityLog'], r => {
      const log = r.activityLog || [];
      sendResponse({ log: msg.date ? log.filter(e => e.date === msg.date) : log });
    });
    return true;
  }

  if (msg.type === 'GET_SUGGESTIONS') {
    chrome.storage.local.get(['suggestions', 'lastAnalyzed'], r => {
      sendResponse({ suggestions: r.suggestions || [], lastAnalyzed: r.lastAnalyzed || null });
    });
    return true;
  }

  if (msg.type === 'RUN_ANALYSIS') {
    triggerAnalysis('manual').then(() => {
      chrome.storage.local.get(['suggestions', 'lastAnalyzed'], r => {
        sendResponse({ suggestions: r.suggestions || [], lastAnalyzed: r.lastAnalyzed || null });
      });
    });
    return true;
  }

  if (msg.type === 'DISMISS_SUGGESTION') {
    chrome.storage.local.get(['suggestions'], r => {
      const suggestions = (r.suggestions || []).filter(s => s.id !== msg.id);
      chrome.storage.local.set({ suggestions }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (msg.type === 'UPDATE_ENTRY') {
    chrome.storage.local.get(['activityLog'], r => {
      const log = r.activityLog || [];
      const idx = log.findIndex(e => e.id === msg.id);
      if (idx !== -1) {
        if (msg.note    !== undefined) log[idx].note    = msg.note;
        if (msg.patient !== undefined) log[idx].patient = msg.patient;
      }
      chrome.storage.local.set({ activityLog: log }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (msg.type === 'CLEAR_LOG') {
    chrome.storage.local.set({ activityLog: [], suggestions: [] }, () => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.type === 'GET_BUILD') {
    const code = generateAutomation(msg.automationType, msg.context || {});
    sendResponse({ code });
    return true;
  }
});
