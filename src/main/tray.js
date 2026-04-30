'use strict';

const { Tray, Menu, nativeImage } = require('electron');

const STATUS = {
  CONNECTED: 'connected',
  EDGE: 'edge',
  DISCONNECTED: 'disconnected',
  SCANNING: 'scanning',
  DISABLED: 'disabled',
  BT_OFF: 'bt-off',
};

function createCircleIcon(fill) {
  // fill: 1.0 = full solid circle, 0.5 = inner dot (edge indicator), 0 = ring only
  const size = 22;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 7.5;
  const innerR = outerR - 2;

  const buffer = Buffer.alloc(size * size * 4, 0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
      const idx = (y * size + x) * 4;

      let alpha = 0;
      if (dist <= outerR) {
        if (fill >= 1.0) {
          alpha = 255;
        } else if (fill >= 0.5) {
          // inner dot only — visually distinct from the full circle
          alpha = dist <= innerR ? 255 : 0;
        } else {
          // ring only
          alpha = dist >= outerR - 2 ? 255 : 0;
        }
        // soft anti-aliased edge
        if (dist > outerR - 1) {
          alpha = Math.round(alpha * (outerR - dist));
        }
      }

      buffer[idx] = 0;
      buffer[idx + 1] = 0;
      buffer[idx + 2] = 0;
      buffer[idx + 3] = Math.max(0, Math.min(255, alpha));
    }
  }

  const img = nativeImage.createFromBitmap(buffer, { width: size, height: size });
  img.setTemplateImage(true);
  return img;
}

// Pre-build icons once at startup — avoids recreating a Buffer + NativeImage on every RSSI tick
const ICON_CACHE = {
  [STATUS.CONNECTED]:    createCircleIcon(1.0),
  [STATUS.EDGE]:         createCircleIcon(0.5),
  [STATUS.DISCONNECTED]: createCircleIcon(0.0),
  [STATUS.SCANNING]:     createCircleIcon(0.5),
  [STATUS.DISABLED]:     createCircleIcon(0.0),
  [STATUS.BT_OFF]:       createCircleIcon(0.0),
};

class TrayManager {
  constructor() {
    this.tray = null;
    this.status = STATUS.SCANNING;
    this.deviceName = null;
    this.currentRssi = null;
    this.enabled = true;
    this.callbacks = {};
  }

  init(callbacks) {
    this.callbacks = callbacks;
    this.tray = new Tray(ICON_CACHE[STATUS.SCANNING]); // show scanning state on startup
    this.tray.setToolTip('ProximityLock');
    this.tray.on('right-click', () => this.tray.popUpContextMenu());
    this._rebuildMenu();
  }

  updateStatus(status, deviceName, rssi) {
    this.status = status;
    this.deviceName = deviceName;
    this.currentRssi = rssi;
    this.tray?.setImage(ICON_CACHE[status] ?? ICON_CACHE[STATUS.DISCONNECTED]);
    this._rebuildMenu();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this._rebuildMenu();
  }

  _statusLabel() {
    if (!this.enabled) return '⚫ Monitoring disabled';
    const name = this.deviceName || 'device';
    switch (this.status) {
      case STATUS.CONNECTED:    return `🟢 ${name} — in range`;
      case STATUS.EDGE:         return `🟡 ${name} — at threshold`;
      case STATUS.DISCONNECTED: return `🔴 ${name} — out of range`;
      case STATUS.SCANNING:     return '🔵 Scanning for devices…';
      case STATUS.BT_OFF:       return '⚫ Bluetooth is off';
      default:                  return '⚫ No device selected';
    }
  }

  _rssiLabel() {
    if (this.currentRssi == null) return 'Signal: —';
    return `Signal: ${this.currentRssi} dBm`;
  }

  _rebuildMenu() {
    const menu = Menu.buildFromTemplate([
      { label: this._statusLabel(), enabled: false },
      { label: this._rssiLabel(),   enabled: false },
      { type: 'separator' },
      {
        label: this.enabled ? '✓ Monitoring on' : 'Enable monitoring',
        click: () => this.callbacks.onToggle?.(),
      },
      {
        label: 'Lock Now',
        click: () => this.callbacks.onLockNow?.(),
      },
      { type: 'separator' },
      {
        label: 'Preferences…',
        click: () => this.callbacks.onOpenPrefs?.(),
      },
      { type: 'separator' },
      {
        label: 'Quit ProximityLock',
        click: () => this.callbacks.onQuit?.(),
      },
    ]);
    this.tray?.setContextMenu(menu);
  }
}

module.exports = { TrayManager, STATUS };
