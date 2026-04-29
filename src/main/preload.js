'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipc-channels');

contextBridge.exposeInMainWorld('proximityLock', {
  getPreferences:  ()       => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  savePreferences: (prefs)  => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  getDevices:      ()       => ipcRenderer.invoke(IPC.GET_DEVICES),
  startScan:       ()       => ipcRenderer.invoke(IPC.START_SCAN),
  stopScan:        ()       => ipcRenderer.invoke(IPC.STOP_SCAN),
  selectDevice:    (device) => ipcRenderer.invoke(IPC.SELECT_DEVICE, device),
  lockNow:         ()       => ipcRenderer.invoke(IPC.LOCK_NOW),
  enableToggle:    ()       => ipcRenderer.invoke(IPC.ENABLE_TOGGLE),

  onDevicesUpdated: (cb) => ipcRenderer.on(IPC.DEVICES_UPDATED, (_e, d) => cb(d)),
  onRssiUpdate:     (cb) => ipcRenderer.on(IPC.DEVICE_RSSI_UPDATE, (_e, d) => cb(d)),
  onStatusChanged:  (cb) => ipcRenderer.on(IPC.STATUS_CHANGED, (_e, s) => cb(s)),
});
