'use strict';

const { app, BrowserWindow, ipcMain, Notification, powerMonitor } = require('electron');
const path = require('path');

const store      = require('./preferences-store');
const lockMgr    = require('./lock-manager');
const { TrayManager, STATUS } = require('./tray');
const { setAutoLaunch }       = require('./auto-launch');
const { applyDockMode }       = require('./app-mode');
const { IPC } = require('../shared/ipc-channels');

let prefsWindow = null;
const tray = new TrayManager();

// ── Preferences window ────────────────────────────────────────────────────────

function openPrefsWindow() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.focus();
    return;
  }
  prefsWindow = new BrowserWindow({
    width: 820,
    height: 480,
    minWidth: 680,
    minHeight: 380,
    title: 'ProximityLock',
    resizable: true,
    minimizable: true,
    show: false,
    vibrancy: 'under-window',
    transparent: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  prefsWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  prefsWindow.webContents.on('console-message', (_e, level, msg) => {
    console.log('[RENDERER]', msg);
  });
  prefsWindow.once('ready-to-show', () => {
    prefsWindow.show();
  });
  prefsWindow.on('closed', () => { prefsWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle(IPC.GET_PREFERENCES, () => store.store);

ipcMain.handle(IPC.SAVE_PREFERENCES, async (_e, prefs) => {
  const ALLOWED = ['startOnLogin', 'menuBarOnly', 'showInDock', 'startMinimized', 'notifications', 'cameraCheckInterval', 'cameraLockDelay', 'showCameraPreview', 'selectedCameraId', 'matchThreshold'];
  for (const key of ALLOWED) {
    if (key in prefs) store.set(key, prefs[key]);
  }
  await setAutoLaunch(prefs.startOnLogin);
  applyDockMode(prefs);

  // Sync preferences to all windows
  const changed = {};
  for (const key of ALLOWED) { if (key in prefs) changed[key] = prefs[key]; }
  prefsWindow?.webContents.send('prefs:changed', changed);
  tray.sendToPopup('prefs:changed', changed);

  return true;
});

ipcMain.handle(IPC.FACE_ENROLL, (_e, { descriptor, photo }) => {
  store.set('faceDescriptor', descriptor);
  store.set('facePhoto', photo);
  console.log('[FACE] Enrolled face, descriptor length:', descriptor.length);
  return true;
});

ipcMain.handle(IPC.FACE_GET, () => {
  return {
    descriptor: store.get('faceDescriptor', null),
    photo: store.get('facePhoto', null),
  };
});

ipcMain.handle(IPC.LOCK_NOW, () => {
  lockMgr.lockNow();
  return true;
});

ipcMain.handle(IPC.OPEN_PREFS, () => {
  openPrefsWindow();
  return true;
});

ipcMain.handle(IPC.QUIT, () => {
  app.quit();
});

function toggleEnabled() {
  const next = !store.get('enabled');
  store.set('enabled', next);
  tray.setEnabled(next);
  if (!next) {
    lockMgr.cancelLock();
    tray.updateStatus(STATUS.DISABLED);
    console.log('[LOCK] Monitoring PAUSED');
  } else {
    console.log('[LOCK] Monitoring RESUMED');
    tray.updateStatus(STATUS.CONNECTED);
  }
  return next;
}

ipcMain.handle(IPC.ENABLE_TOGGLE, toggleEnabled);

// Face status from renderer → update tray icon + forward to popup
ipcMain.on(IPC.FACE_STATUS, (_e, { matched, similarity, countdown }) => {
  if (!store.get('enabled')) return;
  tray.updateStatus(matched ? STATUS.CONNECTED : STATUS.DISCONNECTED);
  tray.sendFaceStatus({ matched, similarity: similarity || 0 });

  // Show match % or countdown next to tray icon
  if (matched) {
    tray.setTrayTitle(`${similarity || 0}%`);
  } else if (countdown != null && countdown > 0) {
    tray.setTrayTitle(`${countdown}s`);
  } else {
    tray.setTrayTitle('');
  }
});

// ── Lock events ───────────────────────────────────────────────────────────────

lockMgr.on('locked', () => {
  if (store.get('notifications')) {
    new Notification({
      title: 'ProximityLock',
      body: 'Screen locked — no face detected.',
    }).show();
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(() => {
  const prefs = store.store;
  applyDockMode(prefs);

  tray.init({
    onOpenPrefs: openPrefsWindow,
    onLockNow:   () => lockMgr.lockNow(),
    onToggle:    () => toggleEnabled(),
    onQuit:      () => app.quit(),
  });
  tray.setEnabled(prefs.enabled);

  powerMonitor.on('lock-screen', () => {
    prefsWindow?.webContents.send(IPC.SCREEN_LOCKED);
  });
  powerMonitor.on('unlock-screen', () => {
    prefsWindow?.webContents.send(IPC.SCREEN_UNLOCKED);
  });

  openPrefsWindow();
});
