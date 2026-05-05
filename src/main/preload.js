'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { IPC } = require('../shared/ipc-channels');

// Resolve @vladmandic/human paths for renderer use
let _humanDir = null;
try {
  _humanDir = path.dirname(path.dirname(require.resolve('@vladmandic/human')));
} catch (_) {}

contextBridge.exposeInMainWorld('electronPaths', {
  humanJsPath:    _humanDir ? pathToFileURL(path.join(_humanDir, 'dist', 'human.js')).href : null,
  humanModelsUrl: _humanDir ? pathToFileURL(path.join(_humanDir, 'models')).href + '/' : null,
});

contextBridge.exposeInMainWorld('proximityLock', {
  getPreferences:     ()       => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  savePreferences:    (prefs)  => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  lockNow:            ()       => ipcRenderer.invoke(IPC.LOCK_NOW),
  enableToggle:       ()       => ipcRenderer.invoke(IPC.ENABLE_TOGGLE),
  enableSet:          (val)    => ipcRenderer.invoke(IPC.ENABLE_SET, val),
  faceEnroll:         (data)   => ipcRenderer.invoke(IPC.FACE_ENROLL, data),
  faceGet:            ()       => ipcRenderer.invoke(IPC.FACE_GET),
  faceStatus:         (status) => ipcRenderer.send(IPC.FACE_STATUS, status),
  openPrefs:          ()       => ipcRenderer.invoke(IPC.OPEN_PREFS),
  quit:               ()       => ipcRenderer.invoke(IPC.QUIT),
  onScreenLocked:     (cb)     => ipcRenderer.on(IPC.SCREEN_LOCKED, () => cb()),
  onScreenUnlocked:   (cb)     => ipcRenderer.on(IPC.SCREEN_UNLOCKED, () => cb()),
  onFaceStatusUpdate: (cb)     => ipcRenderer.on(IPC.POPUP_FACE_STATUS, (_, data) => cb(data)),
  onPrefsChanged:     (cb)     => ipcRenderer.on('prefs:changed', (_, data) => cb(data)),
  onSyncState:        (cb)     => ipcRenderer.on('popup:sync-state', (_, data) => cb(data)),
  onMonitoringChanged:(cb)     => ipcRenderer.on(IPC.MONITORING_CHANGED, (_, enabled) => cb(enabled)),
});
