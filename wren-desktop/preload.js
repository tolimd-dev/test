'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wren', {
  // Electron store — OpenAI key, settings (never exposed to web)
  store: {
    get:    (key)      => ipcRenderer.invoke('store:get',    key),
    set:    (key, val) => ipcRenderer.invoke('store:set',    key, val),
    delete: (key)      => ipcRenderer.invoke('store:delete', key),
  },

  // Wren AI (OpenAI runs in main process)
  send:      (payload) => ipcRenderer.invoke('wren:send',      payload),
  proactive: (payload) => ipcRenderer.invoke('wren:proactive', payload),

  // Activity stream from OS-level observer
  onActivity:            (cb) => ipcRenderer.on('activity:update',   (_, info) => cb(info)),
  onScreenObservation:   (cb) => ipcRenderer.on('screen:observation', (_, data) => cb(data)),

  // Screen capture controls
  setScreenCapture:      (enabled) => ipcRenderer.invoke('screen:set-capture',    enabled),
  getScreenCaptureEnabled:  ()     => ipcRenderer.invoke('screen:capture-enabled'),

  // Window chrome
  hide:     () => ipcRenderer.send('window:hide'),
  minimize: () => ipcRenderer.send('window:minimize'),
  badge:    (text) => ipcRenderer.send('tray:badge', text),
});
