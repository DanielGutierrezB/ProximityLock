'use strict';

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');

const store      = require('./preferences-store');
const bluetooth  = require('./bluetooth');
const lockMgr    = require('./lock-manager');
const { TrayManager, STATUS } = require('./tray');
const { setAutoLaunch }       = require('./auto-launch');
const { applyDockMode }       = require('./app-mode');
const { IPC } = require('../shared/ipc-channels');

let prefsWindow = null;
const tray = new TrayManager();

// Track when a device first drops below threshold
let belowThresholdAt = null;

// ── Preferences window ────────────────────────────────────────────────────────

function openPrefsWindow() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.focus();
    return;
  }
  prefsWindow = new BrowserWindow({
    width: 540,
    height: 660,
    title: 'ProximityLock',
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  prefsWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  prefsWindow.once('ready-to-show', () => prefsWindow.show());
  prefsWindow.on('closed', () => { prefsWindow = null; });
}

// ── Proximity logic ───────────────────────────────────────────────────────────

function handleRssiUpdate(rssi) {
  const { enabled, selectedDeviceId, rssiThreshold, lockDelaySec } = store.store;
  if (!enabled || !selectedDeviceId) return;

  const deviceName = store.get('selectedDeviceName');
  let newStatus;

  if (rssi >= rssiThreshold + 10) {
    newStatus = STATUS.CONNECTED;
  } else if (rssi >= rssiThreshold) {
    newStatus = STATUS.EDGE;
  } else {
    newStatus = STATUS.DISCONNECTED;
  }

  if (newStatus === STATUS.DISCONNECTED) {
    if (!belowThresholdAt) belowThresholdAt = Date.now();
    const elapsed = (Date.now() - belowThresholdAt) / 1000;
    if (elapsed >= lockDelaySec && !lockMgr.isLockPending) {
      lockMgr.scheduleLock(0);
    }
  } else {
    belowThresholdAt = null;
    lockMgr.cancelLock();
  }

  tray.updateStatus(newStatus, deviceName, rssi);
  prefsWindow?.webContents.send(IPC.DEVICE_RSSI_UPDATE, { rssi, status: newStatus });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle(IPC.GET_PREFERENCES, () => store.store);

ipcMain.handle(IPC.SAVE_PREFERENCES, async (_e, prefs) => {
  for (const [k, v] of Object.entries(prefs)) store.set(k, v);
  await setAutoLaunch(prefs.startOnLogin);
  applyDockMode(prefs);
  return true;
});

ipcMain.handle(IPC.GET_DEVICES, () => bluetooth.getDeviceList());

ipcMain.handle(IPC.START_SCAN, () => {
  bluetooth.clearDevices();
  bluetooth.startScanning();
  return true;
});

ipcMain.handle(IPC.STOP_SCAN, () => {
  bluetooth.stopScanning();
  return true;
});

ipcMain.handle(IPC.SELECT_DEVICE, (_e, { id, name }) => {
  store.set('selectedDeviceId', id);
  store.set('selectedDeviceName', name);
  bluetooth.setMonitoredDevice(id);
  return true;
});

ipcMain.handle(IPC.LOCK_NOW, () => {
  lockMgr.lockNow();
  return true;
});

function toggleEnabled() {
  const next = !store.get('enabled');
  store.set('enabled', next);
  tray.setEnabled(next);
  if (!next) {
    lockMgr.cancelLock();
    tray.updateStatus(STATUS.DISABLED, null, null);
  } else {
    bluetooth.startScanning();
  }
  return next;
}

ipcMain.handle(IPC.ENABLE_TOGGLE, toggleEnabled);

// ── Bluetooth events ──────────────────────────────────────────────────────────

bluetooth.on('rssiUpdate', (device) => handleRssiUpdate(device.rssi));

bluetooth.on('deviceDiscovered', () => {
  prefsWindow?.webContents.send(IPC.DEVICES_UPDATED, bluetooth.getDeviceList());
});

bluetooth.on('stateChange', (state) => {
  if (state !== 'poweredOn') {
    tray.updateStatus(STATUS.BT_OFF, null, null);
  }
});

lockMgr.on('locked', () => {
  belowThresholdAt = null; // allow re-lock after user unlocks while still away
  if (store.get('notifications')) {
    new Notification({
      title: 'ProximityLock',
      body: 'Screen locked — device is out of range.',
    }).show();
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.on('window-all-closed', (e) => e.preventDefault());

  const prefs = store.store;
  applyDockMode(prefs);

  tray.init({
    onOpenPrefs: openPrefsWindow,
    onLockNow:   () => lockMgr.lockNow(),
    onToggle:    () => toggleEnabled(),
    onQuit:      () => app.quit(),
  });
  tray.setEnabled(prefs.enabled);

  if (prefs.selectedDeviceId) {
    bluetooth.setMonitoredDevice(prefs.selectedDeviceId);
    tray.updateStatus(STATUS.SCANNING, prefs.selectedDeviceName, null);
  }

  // noble auto-starts scanning via stateChange → 'poweredOn'

  if (!prefs.startMinimized) {
    openPrefsWindow();
  }
});
