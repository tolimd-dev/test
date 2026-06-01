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

let currentUser        = null;
let messageHistory     = [];  // { role, content, wren, wrenName, wrenColor, ts }
let activityLog        = [];  // recent window events from OS observer
let screenObservations = [];  // what GPT-4o Vision has seen recently
let chatViewActive     = true; // whether the chat tab is currently visible

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
    chatViewActive = (view === 'chat');
    if (chatViewActive) clearUnread();
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
// One-time load on startup only. New messages are rendered locally and
// saved to Firestore in the background — no live listener needed.

async function loadConversation() {
  messagesEl.innerHTML = '';
  messageHistory = [];

  try {
    const snap = await db
      .collection('conversations')
      .doc(currentUser.uid)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(400)
      .get();

    messageHistory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    messageHistory.forEach(appendMessage);
    scrollToBottom();

    if (messageHistory.length === 0) showFirstContact();
  } catch (err) {
    console.error('[Wren] Firestore load error:', err.message);
    showSystemMessage('Could not load conversation history — check Firebase rules.');
    showFirstContact();
  }
}

// ── First contact ──────────────────────────────────────────────────────────

const FALLBACK_INTRO = "Hi — I'm Wren. I'm watching your workflow across every app you're in, and I'll speak up when I see something worth talking about. You can also just ask me anything. What are you working on?";

async function showFirstContact() {
  try {
    const res = await window.wren.send({
      message: `The doctor is opening Wren for the first time. Introduce yourself in 2-3 sentences. Tell them who you are (the Council of Wrens — a team of specialized AI partners), that you're watching their workflow across every app on their computer, and that you'll speak up when you have something worth saying. Keep it warm and brief.`,
      history: [],
      context: buildContext(),
    });

    if (res.error === 'no_key') {
      showSystemMessage('OpenAI key not found — go to Settings and paste your sk-... key.');
      return;
    }

    const content = res.reply || FALLBACK_INTRO;
    await saveAndDisplayMessage({
      role:      'assistant',
      content,
      wren:      res.wren      || 'designer',
      wrenName:  res.wrenName  || 'Lucas',
      wrenColor: res.wrenColor || WREN_COLORS.designer,
      proactive: true,
    });
  } catch (err) {
    console.error('[Wren] First contact failed:', err.message);
    await saveAndDisplayMessage({
      role: 'assistant', content: FALLBACK_INTRO,
      wren: 'designer', wrenName: 'Lucas', wrenColor: WREN_COLORS.designer, proactive: true,
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
    ts:        Date.now(),
  };
  appendMessage(userMsg);
  scrollToBottom();

  // Save to Firestore and track in messageHistory so onSnapshot deduplicates by ID
  try {
    const ref = await db.collection('conversations').doc(currentUser.uid).collection('messages').add({
      ...userMsg,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    messageHistory.push({ id: ref.id, ...userMsg });
  } catch { /* non-critical */ }

  // Log activity
  await logActivity({ type: 'wren_message', content: text });

  // Show thinking indicator
  const thinkingEl = showThinking();

  // Capture what's on screen RIGHT NOW — this is what "see that?" refers to.
  // Runs every message regardless of the background capture timer.
  let currentView = null;
  if (captureVideo?.videoWidth && captureCtx) {
    try {
      captureCtx.drawImage(captureVideo, 0, 0, SEND_W, SEND_H);
      const base64 = captureCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      const res = await window.wren.analyzeFrame({
        base64,
        currentApp:   activityLog[0]?.app   || null,
        currentTitle: activityLog[0]?.title || null,
      });
      if (res?.observation) {
        currentView = res.observation;
        screenObservations.unshift({ text: res.observation, ts: Date.now() });
        if (screenObservations.length > 30) screenObservations.pop();
        updateVisionLastSeen(res.observation.slice(0, 120));
      }
    } catch { /* non-fatal — Lucas still responds without it */ }
  }

  // Full conversation history — GPT-4o has a 128k context window so we send
  // everything we have. Lucas needs to remember what was built and decided.
  const history = messageHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  // Call council via main process
  const res = await window.wren.send({
    message: text,
    history,
    context: buildContext(currentView),
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

  // If Lucas delegated to a specialist, show their response as a second bubble
  if (res.delegate) {
    await saveAndDisplayMessage({
      role:      'assistant',
      content:   res.delegate.reply,
      wren:      res.delegate.wren,
      wrenName:  res.delegate.wrenName,
      wrenColor: res.delegate.wrenColor,
    });
    highlightActiveDot(res.delegate.wren);
  } else {
    highlightActiveDot(res.wren);
  }

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
    badge.textContent = msg.wrenName || 'Lucas';
    badge.style.color = msg.wrenColor || '#10b981';
    div.appendChild(badge);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.wrenColor && msg.role === 'assistant') {
    bubble.style.borderLeftColor = msg.wrenColor;
  }

  bubble.innerHTML = renderContent(msg.content || '');
  div.appendChild(bubble);

  // Timestamp — prefer the stored ts, fall back to Firestore server timestamp
  const msgTs = msg.ts || (msg.createdAt?.seconds ? msg.createdAt.seconds * 1000 : null) || Date.now();
  const tsEl = document.createElement('div');
  tsEl.className = 'msg-ts';
  tsEl.textContent = formatTime(msgTs);
  div.appendChild(tsEl);

  messagesEl.appendChild(div);

  // Mark unread if this is an incoming assistant message and chat isn't visible
  if (msg.role === 'assistant' && !chatViewActive) markUnread();
}

function markUnread() {
  const btn = document.querySelector('.nav-btn[data-view="chat"]');
  if (btn && !btn.querySelector('.unread-dot')) {
    const dot = document.createElement('span');
    dot.className = 'unread-dot';
    btn.appendChild(dot);
  }
}

function clearUnread() {
  document.querySelector('.nav-btn[data-view="chat"] .unread-dot')?.remove();
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
  const wrenDef = { designer: 'Lucas', builder: 'Builder', compliance: 'Compliance', security: 'Security' };
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
const MIN_VISION_GAP_MS = 10000;  // background capture: at most once per 10s

let captureVideo    = null;
let captureCanvas   = null;
let captureCtx      = null;
let diffCanvas      = null;
let diffCtx         = null;
let lastDiffPixels  = null;
let lastVisionTs    = 0;
let visionBusy      = false;
let captureInterval = null;

function updateVisionStatus(text, isError = false) {
  const el = $('vision-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-badge ' + (
    isError           ? 'status-error'  :
    text === 'active' ? 'status-active' :
    text === 'paused' ? 'status-paused' :
                        'status-pending'
  );
}

function updateWindowStatus(text) {
  const el = $('window-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-badge ' + (
    text === 'monitoring' ? 'status-active' :
    text === 'paused'     ? 'status-paused' :
                            'status-pending'
  );
}

function updateVisionLastSeen(text) {
  const el = $('vision-last-seen');
  if (el) el.textContent = text;
}

async function startScreenCapture() {
  if (captureInterval) return;
  updateVisionStatus('starting…');
  try {
    // getDisplayMedia is the modern Electron approach — main process intercepts
    // via setDisplayMediaRequestHandler and auto-selects the primary screen.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    captureVideo = document.createElement('video');
    captureVideo.style.display = 'none';
    captureVideo.muted  = true;
    captureVideo.srcObject = stream;
    captureVideo.autoplay  = true;
    document.body.appendChild(captureVideo);

    await new Promise((resolve, reject) => {
      captureVideo.onloadedmetadata = resolve;
      captureVideo.onerror = (e) => reject(new Error('Video error: ' + e));
      setTimeout(() => reject(new Error('Video timed out after 10s')), 10000);
    });
    await captureVideo.play().catch(() => {});

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
    updateVisionStatus('active');
    console.log('[Wren Vision] Screen capture started, video size:', captureVideo.videoWidth, 'x', captureVideo.videoHeight);
  } catch (err) {
    const msg = err.name === 'NotAllowedError' ? 'permission denied' :
                err.name === 'NotFoundError'   ? 'no screen source found' :
                err.message || err.name;
    console.error('[Wren Vision] Start failed:', err.name, err.message);
    updateVisionStatus('error: ' + msg, true);
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
      updateVisionLastSeen(res.observation.slice(0, 120));
      if (currentUser) {
        await logActivity({ type: 'screen_observation', observation: res.observation });
      }
    }
  } catch (err) {
    console.error('[Wren Vision] analyzeFrame error:', err.message);
    updateVisionStatus('error: ' + err.message, true);
  } finally {
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

// ── Pause / resume (from tray menu) ───────────────────────────────────────

window.wren.onPause(() => {
  stopScreenCapture();
  updateVisionStatus('paused');
  updateWindowStatus('paused');
});

window.wren.onResume(async () => {
  updateWindowStatus('monitoring');
  const on = await window.wren.getScreenCaptureEnabled();
  if (on !== false) startScreenCapture();
});

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
  const date    = new Date(ts);
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterd = new Date(+today - 86400000);
  const msgDay  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time    = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (+msgDay === +today)   return time;
  if (+msgDay === +yesterd) return `Yesterday · ${time}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` · ${time}`;
}

// ── Context builder (anonymized before sending to OpenAI) ─────────────────

function buildContext(currentView = null) {
  const current = activityLog[0] || null;
  return {
    currentApp:         current?.app   || null,
    currentTitle:       current?.title || null,
    recentActivity:     activityLog.slice(0, 20).map(a => ({ app: a.app, title: a.title })),
    screenObservations: screenObservations.slice(0, 10).map(o => o.text),
    currentView,
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
