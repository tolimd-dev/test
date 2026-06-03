'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onData:  (cb) => ipcRenderer.on('toast:data', (_, data) => cb(data)),
  open:    ()   => ipcRenderer.send('toast:open'),
  dismiss: ()   => ipcRenderer.send('toast:dismiss'),
});
