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

let currentUser       = null;
let messageHistory    = [];   // { role, content, wren, wrenName, wrenColor, ts }
let activityLog       = [];   // recent window events from OS observer
let screenObservations = [];  // what GPT-4o Vision has seen recently
let messagesUnsub     = null; // Firestore listener unsubscribe

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
  window.wren.getScreenCaptureEnabled().then(on => { if (on !== false) startScreenCapture(); });
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
  showApp(auth.currentUser);
});

$('btn-signout').addEventListener('click', async () => {
  if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
  stopScreenCapture();
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
  let id = `local-${Date.now()}`;
  try {
    const ref = await db
      .collection('conversations')
      .doc(currentUser.uid)
      .collection('messages')
      .add({
        ...msg,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    id = ref.id;
  } catch { /* Firestore write failed — still show message locally */ }
  const full = { id, ...msg };
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

// ── Continuous screen recording ────────────────────────────────────────────
// Captures a live video stream, samples frames at 500ms, diffs adjacent
// frames, and sends changed frames to GPT-4o Vision via main process IPC.
// Only the extracted observation text is stored — never the screenshot.

const DIFF_W  = 160;   // small canvas for fast pixel diffing
const DIFF_H  = 90;
const SEND_W  = 1280;  // resolution sent to Vision
const SEND_H  = 720;
const DIFF_THRESHOLD    = 0.05;   // 5% pixels changed = meaningful
const MIN_VISION_GAP_MS = 30000;  // at most one Vision call per 30s (cheap test mode)

let captureVideo    = null;
let captureCanvas   = null;
let captureCtx      = null;
let diffCanvas      = null;
let diffCtx         = null;
let lastDiffPixels  = null;
let lastVisionTs    = 0;
let visionBusy      = false;
let captureInterval = null;

async function startScreenCapture() {
  if (captureInterval) return;
  try {
    const sources = await window.wren.getSources();
    const src = sources.find(s => /screen|entire|display/i.test(s.name)) || sources[0];
    if (!src) { console.warn('[Wren Vision] No screen source found'); return; }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id } },
    });

    captureVideo = document.createElement('video');
    captureVideo.style.display = 'none';
    captureVideo.srcObject = stream;
    captureVideo.autoplay  = true;
    document.body.appendChild(captureVideo);

    // Canvas for Vision-quality frames
    captureCanvas = document.createElement('canvas');
    captureCanvas.width  = SEND_W;
    captureCanvas.height = SEND_H;
    captureCtx = captureCanvas.getContext('2d');

    // Small canvas for cheap pixel diffing
    diffCanvas = document.createElement('canvas');
    diffCanvas.width  = DIFF_W;
    diffCanvas.height = DIFF_H;
    diffCtx = diffCanvas.getContext('2d');

    captureInterval = setInterval(sampleFrame, 500);
  } catch (err) {
    console.error('[Wren Vision] Start failed:', err.message);
  }
}

function stopScreenCapture() {
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  captureVideo?.srcObject?.getTracks().forEach(t => t.stop());
  captureVideo?.remove();
  captureVideo = null;
  lastDiffPixels = null;
}

async function sampleFrame() {
  if (!captureVideo?.videoWidth) return;  // video not ready yet

  // Draw to tiny diff canvas
  diffCtx.drawImage(captureVideo, 0, 0, DIFF_W, DIFF_H);
  const { data } = diffCtx.getImageData(0, 0, DIFF_W, DIFF_H);

  const changed = lastDiffPixels ? pixelsDiffer(data, lastDiffPixels) : true;
  lastDiffPixels = new Uint8ClampedArray(data);

  if (!changed)      return;  // screen is static
  if (visionBusy)    return;  // previous Vision call still in flight
  if (Date.now() - lastVisionTs < MIN_VISION_GAP_MS) return;  // rate limit

  // Draw full-res frame for Vision
  captureCtx.drawImage(captureVideo, 0, 0, SEND_W, SEND_H);
  const base64 = captureCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];

  visionBusy   = true;
  lastVisionTs = Date.now();

  try {
    const res = await window.wren.analyzeFrame({
      base64,
      currentApp:   activityLog[0]?.app   || null,
      currentTitle: activityLog[0]?.title || null,
    });
    if (res?.observation) {
      screenObservations.unshift({ text: res.observation, ts: Date.now() });
      if (screenObservations.length > 30) screenObservations.pop();
      if (currentUser) {
        await logActivity({ type: 'screen_observation', observation: res.observation });
      }
    }
  } catch { /* non-fatal */ }
  finally {
    visionBusy = false;
  }
}

function pixelsDiffer(a, b) {
  let diff = 0;
  const samples = a.length / 16;  // sample every 4th pixel (step 16 bytes)
  for (let i = 0; i < a.length; i += 16) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 30) diff++;
  }
  return diff / samples > DIFF_THRESHOLD;
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
    currentApp:         current?.app   || null,
    currentTitle:       current?.title || null,
    recentActivity:     activityLog.slice(0, 20).map(a => ({ app: a.app, title: a.title })),
    screenObservations: screenObservations.slice(0, 10).map(o => o.text),
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
  const key     = await window.wren.store.get('openaiApiKey') || '';
  const model   = await window.wren.store.get('openaiModel')  || 'gpt-4o-mini';
  const capture = await window.wren.getScreenCaptureEnabled();
  $('settings-apikey').value         = key ? '••••••••' : '';
  $('settings-model').value          = model;
  $('settings-screen-capture').checked = capture !== false;
})();

$('settings-screen-capture').addEventListener('change', async (e) => {
  const on = e.target.checked;
  await window.wren.setScreenCapture(on);
  on ? startScreenCapture() : stopScreenCapture();
});

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
