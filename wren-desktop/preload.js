'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wren', {
  // Electron store — OpenAI key, settings (never exposed to web)
  store: {
    get:    (key)      => ipcRenderer.invoke('store:get',    key),
    set:    (key, val) => ipcRenderer.invoke('store:set',    key, val),
    delete: (key)      => ipcRenderer.invoke('store:delete', key),
  },

  // Wren AI (OpenAI runs in main process — key never touches renderer)
  send:         (payload) => ipcRenderer.invoke('wren:send',         payload),
  proactive:    (payload) => ipcRenderer.invoke('wren:proactive',    payload),
  analyzeFrame: (payload) => ipcRenderer.invoke('wren:analyze-frame', payload),

  // Screen source ID — renderer needs this to start getUserMedia
  getSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),

  // Screen capture preference (persisted in electron-store)
  setScreenCapture:        (enabled) => ipcRenderer.invoke('screen:set-capture',    enabled),
  getScreenCaptureEnabled: ()        => ipcRenderer.invoke('screen:capture-enabled'),

  // Activity stream from OS-level window observer
  onActivity: (cb) => ipcRenderer.on('activity:update', (_, info) => cb(info)),

  // Pause / resume (triggered from tray menu)
  onPause:  (cb) => ipcRenderer.on('wren:pause',  () => cb()),
  onResume: (cb) => ipcRenderer.on('wren:resume', () => cb()),

  // Window chrome
  hide:     () => ipcRenderer.send('window:hide'),
  minimize: () => ipcRenderer.send('window:minimize'),
  badge:    (text) => ipcRenderer.send('tray:badge', text),
});
