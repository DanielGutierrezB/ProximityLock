'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Resolve @vladmandic/human paths for renderer use
// require.resolve('@vladmandic/human') → .../dist/human.node.js
// go up two levels: dist/ → package root
let _humanDir = null;
try {
  _humanDir = path.dirname(path.dirname(require.resolve('@vladmandic/human')));
} catch (_) {}

contextBridge.exposeInMainWorld('electronPaths', {
  humanJsPath:    _humanDir ? `file://${path.join(_humanDir, 'dist', 'human.js')}` : null,
  humanModelsUrl: _humanDir ? `file://${path.join(_humanDir, 'models')}/` : null,
});

// IPC channels inlined to avoid require() path issues in sandboxed preload
const IPC = {
  DEVICES_UPDATED: 'devices:updated',
  DEVICE_RSSI_UPDATE: 'device:rssi-update',
  STATUS_CHANGED: 'status:changed',
  GET_PREFERENCES: 'preferences:get',
  SAVE_PREFERENCES: 'preferences:save',
  GET_DEVICES: 'devices:get',
  START_SCAN: 'scan:start',
  STOP_SCAN: 'scan:stop',
  SELECT_DEVICE: 'device:select',
  LOCK_NOW: 'lock:now',
  ENABLE_TOGGLE: 'enable:toggle',
  SAVE_DEVICE: 'device:save',
  REMOVE_DEVICE: 'device:remove',
};

contextBridge.exposeInMainWorld('proximityLock', {
  getPreferences:  ()       => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  savePreferences: (prefs)  => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  getDevices:      ()       => ipcRenderer.invoke(IPC.GET_DEVICES),
  startScan:       ()       => ipcRenderer.invoke(IPC.START_SCAN),
  stopScan:        ()       => ipcRenderer.invoke(IPC.STOP_SCAN),
  selectDevice:    (device) => ipcRenderer.invoke(IPC.SELECT_DEVICE, device),
  lockNow:         ()       => ipcRenderer.invoke(IPC.LOCK_NOW),
  enableToggle:    ()       => ipcRenderer.invoke(IPC.ENABLE_TOGGLE),
  saveDevice:      (device) => ipcRenderer.invoke(IPC.SAVE_DEVICE, device),
  removeDevice:    (device) => ipcRenderer.invoke(IPC.REMOVE_DEVICE, device),

  onDevicesUpdated: (cb) => ipcRenderer.on(IPC.DEVICES_UPDATED, (_e, d) => cb(d)),
  onRssiUpdate:     (cb) => ipcRenderer.on(IPC.DEVICE_RSSI_UPDATE, (_e, d) => cb(d)),
  onStatusChanged:  (cb) => ipcRenderer.on(IPC.STATUS_CHANGED, (_e, s) => cb(s)),
});
