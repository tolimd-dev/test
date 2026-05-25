'use strict';

// ── Firebase init ──────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            'AIzaSyDIPPZDT9jWSDAMssHEvuI_jtVCUpgUlBA',
  authDomain:        'mila-wren.firebaseapp.com',
  projectId:         'mila-wren',
  storageBucket:     'mila-wren.firebasestorage.app',
  messagingSenderId: '366326904672',
  appId:             '1:366326904672:web:c4dca30f6a6cd52f351005',
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── State ──────────────────────────────────────────────────────────────────

let currentUser      = null;
let messageHistory   = [];   // { role, content, wren, wrenName, wrenColor, ts }
let activityLog      = [];   // recent window events from OS observer
let messagesUnsub    = null; // Firestore listener unsubscribe

const WREN_COLORS = {
  designer:   '#10b981',
  builder:    '#3b82f6',
  compliance: '#f59e0b',
  security:   '#ef4444',
  coordinator:'#6366f1',
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const authScreen    = $('auth-screen');
const appEl         = $('app');
const messagesEl    = $('messages');
const msgInput      = $('msg-input');
const sendBtn       = $('btn-send');
const authError     = $('auth-error');
const councilDots   = document.querySelectorAll('.dot');

// ── View switching ─────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    btn.classList.add('active');
    $(`view-${view}`).classList.remove('hidden');
  });
});

// ── Auth ───────────────────────────────────────────────────────────────────

function showAuth() {
  authScreen.classList.remove('hidden');
  appEl.classList.add('hidden');
}

function showApp(user) {
  currentUser = user;
  authScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  $('settings-user').textContent = user.email;
  loadConversation();
  scheduleProactiveCheck();
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

$('btn-signin').addEventListener('click', async () => {
  const email    = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email || !password) return showAuthError('Enter email and password.');
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
});

$('btn-signup').addEventListener('click', async () => {
  const email    = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email || !password) return showAuthError('Enter email and password.');
  if (password.length < 8) return showAuthError('Password must be at least 8 characters.');
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    // Save user profile
    await db.collection('users').doc(cred.user.uid).set({
      email,
      displayName: email.split('@')[0],
      role: email.toLowerCase().includes('teresa') ? 'assistant' : 'doctor',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Show API key entry
    $('key-section').classList.remove('hidden');
    $('btn-signup').disabled = true;
    $('btn-signin').disabled = true;
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
});

$('btn-save-key').addEventListener('click', async () => {
  const key = $('auth-apikey').value.trim();
  if (!key.startsWith('sk-')) return showAuthError('Paste your OpenAI API key (starts with sk-).');
  await window.wren.store.set('openaiApiKey', key);
  // Auth state change will fire showApp
});

$('btn-signout').addEventListener('click', async () => {
  if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
  await auth.signOut();
});

auth.onAuthStateChanged(async user => {
  if (user) {
    // Check if OpenAI key is set
    const key = await window.wren.store.get('openaiApiKey');
    if (!key) {
      // Show key entry on auth screen
      authScreen.classList.remove('hidden');
      appEl.classList.add('hidden');
      $('key-section').classList.remove('hidden');
      $('btn-signup').classList.add('hidden');
      $('btn-signin').classList.add('hidden');
      $('auth-subtitle').textContent = 'One more step — add your OpenAI key';
    } else {
      showApp(user);
    }
  } else {
    showAuth();
  }
});

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':          'Invalid email address.',
    'auth/user-not-found':         'No account with that email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/email-already-in-use':   'An account with that email already exists — sign in instead.',
    'auth/weak-password':          'Password is too weak.',
    'auth/invalid-credential':     'Email or password is incorrect.',
  };
  return map[code] || 'Authentication failed — check your email and password.';
}

// ── Load conversation from Firestore ───────────────────────────────────────

function loadConversation() {
  if (messagesUnsub) messagesUnsub();

  messagesEl.innerHTML = '';
  messageHistory = [];

  messagesUnsub = db
    .collection('conversations')
    .doc(currentUser.uid)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(100)
    .onSnapshot(snap => {
      // On first load, render all messages
      // On subsequent updates, just append new ones
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Rebuild if count changed significantly (e.g. clear)
      if (Math.abs(docs.length - messageHistory.length) > 1) {
        messagesEl.innerHTML = '';
        messageHistory = [];
      }

      docs.forEach(msg => {
        if (!messageHistory.find(m => m.id === msg.id)) {
          messageHistory.push(msg);
          appendMessage(msg);
        }
      });

      scrollToBottom();

      // Show first-contact message if no history
      if (docs.length === 0) {
        showFirstContact();
      }
    });
}

// ── First contact ──────────────────────────────────────────────────────────

async function showFirstContact() {
  const context = buildContext();
  const res = await window.wren.send({
    message: `The doctor is opening Wren for the first time. Introduce yourself in 2-3 sentences. Tell them who you are (the Council of Wrens — a team of specialized AI partners), that you're watching their workflow, and that you'll speak up when you have something worth saying. Keep it warm and brief.`,
    history: [],
    context,
  });
  if (res.reply) {
    await saveAndDisplayMessage({
      role:       'assistant',
      content:    res.reply,
      wren:       res.wren      || 'designer',
      wrenName:   res.wrenName  || 'Designer',
      wrenColor:  res.wrenColor || WREN_COLORS.designer,
      proactive:  true,
    });
  }
}

// ── Send message ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  msgInput.value = '';
  autoResize();

  // Show user message immediately
  const userMsg = {
    role:      'user',
    content:   text,
    wren:      null,
    wrenName:  null,
    wrenColor: null,
  };
  appendMessage(userMsg);
  scrollToBottom();

  // Save user message to Firestore
  await db.collection('conversations').doc(currentUser.uid).collection('messages').add({
    ...userMsg,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Log activity
  await logActivity({ type: 'wren_message', content: text });

  // Show thinking indicator
  const thinkingEl = showThinking();

  // Build history for OpenAI (last 20 exchanges)
  const history = messageHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-40)
    .map(m => ({ role: m.role, content: m.content }));

  // Call council via main process
  const res = await window.wren.send({
    message: text,
    history,
    context: buildContext(),
  });

  thinkingEl.remove();

  if (res.error === 'no_key') {
    showSystemMessage('No OpenAI key set — go to Settings and add your sk-... key.');
    return;
  }

  if (res.error) {
    showSystemMessage(`Error: ${res.error}`);
    return;
  }

  await saveAndDisplayMessage({
    role:      'assistant',
    content:   res.reply,
    wren:      res.wren,
    wrenName:  res.wrenName,
    wrenColor: res.wrenColor,
  });

  highlightActiveDot(res.wren);
  scrollToBottom();
}

// ── Save message to Firestore + display ────────────────────────────────────

async function saveAndDisplayMessage(msg) {
  const ref = await db
    .collection('conversations')
    .doc(currentUser.uid)
    .collection('messages')
    .add({
      ...msg,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  const full = { id: ref.id, ...msg };
  messageHistory.push(full);
  appendMessage(full);
  return full;
}

// ── Render a message bubble ────────────────────────────────────────────────

function appendMessage(msg) {
  const div = document.createElement('div');
  div.className = `msg msg-${msg.role}`;
  if (msg.id) div.dataset.id = msg.id;

  if (msg.role === 'assistant') {
    const badge = document.createElement('div');
    badge.className = 'wren-badge';
    badge.textContent = msg.wrenName || 'Wren';
    badge.style.color = msg.wrenColor || '#10b981';
    div.appendChild(badge);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.wrenColor && msg.role === 'assistant') {
    bubble.style.borderLeftColor = msg.wrenColor;
  }

  // Render markdown-ish: code blocks, bold
  bubble.innerHTML = renderContent(msg.content || '');
  div.appendChild(bubble);

  messagesEl.appendChild(div);
}

function renderContent(text) {
  // Basic markdown: code blocks, inline code, bold
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function showThinking() {
  const div = document.createElement('div');
  div.className = 'msg msg-assistant thinking';
  div.innerHTML = '<div class="bubble"><span class="dot-pulse"></span></div>';
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function showSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-system';
  div.innerHTML = `<div class="bubble">${text}</div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function highlightActiveDot(wren) {
  councilDots.forEach(d => {
    d.classList.toggle('active', d.dataset.wren === wren);
  });
  const wrenDef = { designer: 'Designer', builder: 'Builder', compliance: 'Compliance', security: 'Security' };
  $('active-wren-label').textContent = wrenDef[wren] || 'Wren';
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Activity logging ───────────────────────────────────────────────────────

window.wren.onActivity(async (info) => {
  activityLog.unshift(info);
  if (activityLog.length > 100) activityLog.pop();

  // Render in activity view
  renderActivityList();

  // Log to Firestore
  if (currentUser) {
    await logActivity({ type: 'window_focus', ...info });
  }
});

async function logActivity(entry) {
  if (!currentUser) return;
  try {
    await db.collection('activityLog').add({
      ...entry,
      userId:    currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch { /* non-critical */ }
}

function renderActivityList() {
  const el = $('activity-list');
  el.innerHTML = activityLog.slice(0, 30).map(a => `
    <div class="activity-item">
      <span class="activity-app">${escHtml(a.app)}</span>
      <span class="activity-title">${escHtml(a.title?.slice(0, 60) || '')}</span>
      <span class="activity-ts">${formatTime(a.ts)}</span>
    </div>
  `).join('');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Context builder (anonymized before sending to OpenAI) ─────────────────

function buildContext() {
  const current = activityLog[0] || null;
  return {
    currentApp:    current?.app   || null,
    currentTitle:  current?.title || null,
    recentActivity: activityLog.slice(0, 20).map(a => ({ app: a.app, title: a.title })),
  };
}

// ── Proactive Designer check ───────────────────────────────────────────────

let proactiveTimer = null;

function scheduleProactiveCheck() {
  if (proactiveTimer) clearInterval(proactiveTimer);
  // Check every 30 minutes
  proactiveTimer = setInterval(runProactiveCheck, 30 * 60 * 1000);
}

async function runProactiveCheck() {
  if (!currentUser || activityLog.length < 5) return;

  const res = await window.wren.proactive({ context: buildContext() });
  if (!res.observation) return;

  await saveAndDisplayMessage({
    role:      'assistant',
    content:   res.observation,
    wren:      res.wren      || 'designer',
    wrenName:  res.wrenName  || 'Designer',
    wrenColor: res.wrenColor || WREN_COLORS.designer,
    proactive: true,
  });

  scrollToBottom();
  window.wren.badge('!');
}

// ── Settings ───────────────────────────────────────────────────────────────

(async () => {
  const key   = await window.wren.store.get('openaiApiKey')  || '';
  const model = await window.wren.store.get('openaiModel')   || 'gpt-4o-mini';
  $('settings-apikey').value = key ? '••••••••' : '';
  $('settings-model').value  = model;
})();

$('btn-update-key').addEventListener('click', async () => {
  const key = $('settings-apikey').value.trim();
  if (!key || key === '••••••••') return;
  if (!key.startsWith('sk-')) { alert('Key should start with sk-'); return; }
  await window.wren.store.set('openaiApiKey', key);
  $('settings-apikey').value = '••••••••';
  showSystemMessage('API key updated.');
});

$('btn-save-model').addEventListener('click', async () => {
  const model = $('settings-model').value;
  await window.wren.store.set('openaiModel', model);
  showSystemMessage(`Model set to ${model}.`);
});

$('btn-clear-chat').addEventListener('click', async () => {
  if (!confirm('Clear your conversation history? This cannot be undone.')) return;
  // Mark cleared in Firestore (we don't delete docs)
  await db.collection('conversationMeta').doc(currentUser.uid).set({
    clearedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  messagesEl.innerHTML = '';
  messageHistory = [];
  showFirstContact();
});

// ── Input handling ─────────────────────────────────────────────────────────

msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

msgInput.addEventListener('input', autoResize);
sendBtn.addEventListener('click', sendMessage);

function autoResize() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 160) + 'px';
}

// ── Window controls ────────────────────────────────────────────────────────

$('btn-hide').addEventListener('click',     () => window.wren.hide());
$('btn-minimize').addEventListener('click', () => window.wren.minimize());
