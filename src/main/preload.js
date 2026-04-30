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
  SCREEN_LOCKED:    'system:screen-locked',
  SCREEN_UNLOCKED:  'system:screen-unlocked',
  POPUP_FACE_STATUS:'popup:face-status',
  OPEN_PREFS:       'app:open-prefs',
  QUIT:             'app:quit',
};

contextBridge.exposeInMainWorld('proximityLock', {
  getPreferences:     ()       => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  savePreferences:    (prefs)  => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  lockNow:            ()       => ipcRenderer.invoke(IPC.LOCK_NOW),
  enableToggle:       ()       => ipcRenderer.invoke(IPC.ENABLE_TOGGLE),
  faceEnroll:         (data)   => ipcRenderer.invoke(IPC.FACE_ENROLL, data),
  faceGet:            ()       => ipcRenderer.invoke(IPC.FACE_GET),
  faceStatus:         (status) => ipcRenderer.send(IPC.FACE_STATUS, status),
  openPrefs:          ()       => ipcRenderer.invoke(IPC.OPEN_PREFS),
  quit:               ()       => ipcRenderer.invoke(IPC.QUIT),
  onScreenLocked:     (cb)     => ipcRenderer.on(IPC.SCREEN_LOCKED, () => cb()),
  onScreenUnlocked:   (cb)     => ipcRenderer.on(IPC.SCREEN_UNLOCKED, () => cb()),
  onFaceStatusUpdate: (cb)     => ipcRenderer.on(IPC.POPUP_FACE_STATUS, (_, data) => cb(data)),
});
