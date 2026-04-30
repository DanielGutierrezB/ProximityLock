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

// Only push full device lists when the scan modal is open
let scanModalOpen = false;

// ── Preferences window ────────────────────────────────────────────────────────

function openPrefsWindow() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.focus();
    return;
  }
  prefsWindow = new BrowserWindow({
    width: 1080,
    height: 680,
    minWidth: 720,
    minHeight: 500,
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
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  prefsWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  // Forward renderer console to main process stdout
  prefsWindow.webContents.on('console-message', (_e, level, msg) => {
    console.log('[RENDERER]', msg);
  });
  prefsWindow.once('ready-to-show', () => {
    prefsWindow.show();
  });
  prefsWindow.on('closed', () => { prefsWindow = null; });
}

// ── Proximity logic ───────────────────────────────────────────────────────────

function handleRssiUpdate(rssi) {
  const { enabled, selectedDeviceId, rssiThreshold, lockDelaySec } = store.store;
  if (!selectedDeviceId) return;

  const deviceName = store.get('selectedDeviceName');
  let newStatus;

  if (rssi >= rssiThreshold + 10) {
    newStatus = STATUS.CONNECTED;
  } else if (rssi >= rssiThreshold) {
    newStatus = STATUS.EDGE;
  } else {
    newStatus = STATUS.DISCONNECTED;
  }

  // Always update UI with signal data
  tray.updateStatus(newStatus, deviceName, rssi);
  prefsWindow?.webContents.send(IPC.DEVICE_RSSI_UPDATE, { rssi, status: newStatus });

  // Only trigger lock/unlock logic when enabled
  if (!enabled) return;

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
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle(IPC.GET_PREFERENCES, () => store.store);

ipcMain.handle(IPC.SAVE_PREFERENCES, async (_e, prefs) => {
  // Whitelist keys to prevent arbitrary writes from renderer
  const ALLOWED = ['rssiThreshold', 'lockDelaySec', 'startOnLogin', 'menuBarOnly', 'showInDock', 'startMinimized', 'notifications'];
  for (const key of ALLOWED) {
    if (key in prefs) store.set(key, prefs[key]);
  }
  // Clamp numeric values to valid ranges
  const threshold = store.get('rssiThreshold');
  if (threshold < -100 || threshold > -40) store.set('rssiThreshold', -70);
  const delay = store.get('lockDelaySec');
  if (delay < 1 || delay > 300) store.set('lockDelaySec', 10);

  await setAutoLaunch(prefs.startOnLogin);
  applyDockMode(prefs);
  return true;
});

ipcMain.handle(IPC.GET_DEVICES, () => bluetooth.getDeviceList());

ipcMain.handle(IPC.START_SCAN, () => {
  scanModalOpen = true;
  bluetooth.clearDevices();
  // Stop first so startScanning() doesn't bail due to this.scanning === true
  bluetooth.stopScanning();
  bluetooth.startScanning();
  return true;
});

ipcMain.handle(IPC.STOP_SCAN, () => {
  scanModalOpen = false;
  bluetooth.stopScanning();
  // Resume monitoring scan for the active device
  const { selectedDeviceId } = store.store;
  if (selectedDeviceId) {
    bluetooth.startScanning();
  }
  return true;
});

ipcMain.handle(IPC.SELECT_DEVICE, (_e, { id, name }) => {
  belowThresholdAt = null; // reset grace period so new device gets a clean slate
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

ipcMain.handle(IPC.SAVE_DEVICE, (_e, { id, name }) => {
  const saved = store.get('savedDevices') || [];
  if (!saved.find(d => d.id === id)) {
    saved.push({ id, name, addedAt: Date.now() });
    store.set('savedDevices', saved);
  }
  return store.get('savedDevices');
});

ipcMain.handle(IPC.REMOVE_DEVICE, (_e, { id }) => {
  const saved = (store.get('savedDevices') || []).filter(d => d.id !== id);
  store.set('savedDevices', saved);
  return saved;
});

// ── Bluetooth events ──────────────────────────────────────────────────────────

bluetooth.on('rssiUpdate', (device) => handleRssiUpdate(device.rssi));

bluetooth.on('deviceDiscovered', () => {
  // Only push full device list when scan modal is open
  if (scanModalOpen) {
    prefsWindow?.webContents.send(IPC.DEVICES_UPDATED, bluetooth.getDeviceList());
  }
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

// Prevent quitting when all windows close (menu bar app stays alive)
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

  if (prefs.selectedDeviceId) {
    bluetooth.setMonitoredDevice(prefs.selectedDeviceId);
    tray.updateStatus(STATUS.SCANNING, prefs.selectedDeviceName, null);
  }

  // noble auto-starts scanning via stateChange → 'poweredOn'

  openPrefsWindow();
});
