'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path  = require('path');
const Store = require('electron-store');
const council = require('./src/council');

const store = new Store({ name: 'wren-config' });

let mainWindow  = null;
let tray        = null;
let isQuitting  = false;
let activeWinFn = null;
let lastWindowKey = '';
let observerTimer = null;

// ── Active window monitoring ───────────────────────────────────────────────

async function loadActiveWin() {
  if (!activeWinFn) {
    const mod = await import('active-win');
    activeWinFn = mod.default;
  }
  return activeWinFn;
}

async function observerTick() {
  try {
    const fn  = await loadActiveWin();
    const win = await fn();
    if (!win) return;

    const key = `${win.owner?.name}::${win.title}`;
    if (key === lastWindowKey) return;
    lastWindowKey = key;

    mainWindow?.webContents.send('activity:update', {
      app:   win.owner?.name || 'unknown',
      title: win.title || '',
      url:   win.url   || null,
      ts:    Date.now(),
    });
  } catch { /* silent — active-win can fail on permission denied */ }
}

function startObserver() {
  if (observerTimer) return;
  observerTick();
  observerTimer = setInterval(observerTick, 8000);
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  const { height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width:    420,
    height:   Math.min(720, height - 40),
    minWidth: 360,
    minHeight: 500,
    frame:    false,
    resizable: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '..', 'dpc-workflow-observer', 'icons', 'icon16.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Wren');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Wren', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit Wren', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () =>
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus())
  );
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('store:get',    (_, key)      => store.get(key));
ipcMain.handle('store:set',    (_, key, val) => store.set(key, val));
ipcMain.handle('store:delete', (_, key)      => store.delete(key));

ipcMain.on('window:hide',     () => mainWindow?.hide());
ipcMain.on('window:minimize', () => mainWindow?.minimize());

ipcMain.on('tray:badge', (_, text) => {
  tray?.setToolTip(text ? `Wren (${text})` : 'Wren');
});

// Wren chat — OpenAI key lives in electron-store (main process only)
ipcMain.handle('wren:send', async (_, { message, history, context }) => {
  const apiKey = store.get('openaiApiKey');
  if (!apiKey) return { error: 'no_key' };
  const model = store.get('openaiModel') || 'gpt-4o-mini';
  try {
    return await council.processMessage({ message, history, context, apiKey, model });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('wren:proactive', async (_, { context }) => {
  const apiKey = store.get('openaiApiKey');
  if (!apiKey) return { observation: null };
  const model = store.get('openaiModel') || 'gpt-4o-mini';
  try {
    return await council.designerProactive({ context, apiKey, model });
  } catch {
    return { observation: null };
  }
});

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  startObserver();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else mainWindow.show();
});
