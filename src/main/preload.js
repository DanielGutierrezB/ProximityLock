'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Resolve @vladmandic/human paths for renderer use
let _humanDir = null;
try {
  _humanDir = path.dirname(path.dirname(require.resolve('@vladmandic/human')));
} catch (_) {}

contextBridge.exposeInMainWorld('electronPaths', {
  humanJsPath:    _humanDir ? `file://${path.join(_humanDir, 'dist', 'human.js')}` : null,
  humanModelsUrl: _humanDir ? `file://${path.join(_humanDir, 'models')}/` : null,
});

const IPC = {
  GET_PREFERENCES:  'prefs:get',
  SAVE_PREFERENCES: 'prefs:save',
  LOCK_NOW:         'lock:now',
  ENABLE_TOGGLE:    'enable:toggle',
  FACE_ENROLL:      'face:enroll',
  FACE_GET:         'face:get',
  FACE_STATUS:      'face:status',
};

contextBridge.exposeInMainWorld('proximityLock', {
  getPreferences:  ()       => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  savePreferences: (prefs)  => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  lockNow:         ()       => ipcRenderer.invoke(IPC.LOCK_NOW),
  enableToggle:    ()       => ipcRenderer.invoke(IPC.ENABLE_TOGGLE),
  faceEnroll:      (data)   => ipcRenderer.invoke(IPC.FACE_ENROLL, data),
  faceGet:         ()       => ipcRenderer.invoke(IPC.FACE_GET),
  faceStatus:      (status) => ipcRenderer.send(IPC.FACE_STATUS, status),
});
