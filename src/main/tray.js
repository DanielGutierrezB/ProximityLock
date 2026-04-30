'use strict';

const { Tray, Menu, nativeImage } = require('electron');

const STATUS = {
  CONNECTED: 'connected',       // face matched
  DISCONNECTED: 'disconnected', // no face / unknown
  DISABLED: 'disabled',         // monitoring off
  IDLE: 'idle',                 // no camera started
};

function createColorCircleIcon(r, g, b) {
  const size = 22;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 7;

  const buffer = Buffer.alloc(size * size * 4, 0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        let alpha = 255;
        if (dist > radius - 1) {
          alpha = Math.round(255 * (radius - dist));
        }
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = Math.max(0, Math.min(255, alpha));
      }
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

const ICON_CACHE = {
  [STATUS.CONNECTED]:    createColorCircleIcon(52, 199, 89),   // green
  [STATUS.DISCONNECTED]: createColorCircleIcon(255, 59, 48),   // red
  [STATUS.DISABLED]:     createColorCircleIcon(142, 142, 147), // gray
  [STATUS.IDLE]:         createColorCircleIcon(142, 142, 147), // gray
};

class TrayManager {
  constructor() {
    this.tray = null;
    this.status = STATUS.IDLE;
    this.enabled = false;
    this.callbacks = {};
  }

  init(callbacks) {
    this.callbacks = callbacks;
    this.tray = new Tray(ICON_CACHE[STATUS.IDLE]);
    this.tray.setToolTip('ProximityLock');
    this.tray.on('right-click', () => this.tray.popUpContextMenu());
    this._rebuildMenu();
  }

  updateStatus(status) {
    this.status = status;
    this.tray?.setImage(ICON_CACHE[status] ?? ICON_CACHE[STATUS.IDLE]);
    this._rebuildMenu();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this._rebuildMenu();
  }

  _statusLabel() {
    if (!this.enabled) return '⚫ Monitoring off';
    switch (this.status) {
      case STATUS.CONNECTED:    return '🟢 Face matched';
      case STATUS.DISCONNECTED: return '🔴 No face detected';
      default:                  return '⚫ Idle';
    }
  }

  _rebuildMenu() {
    const menu = Menu.buildFromTemplate([
      { label: this._statusLabel(), enabled: false },
      { type: 'separator' },
      {
        label: this.enabled ? '⏹ Stop Monitoring' : '▶ Start Monitoring',
        click: () => this.callbacks.onToggle?.(),
      },
      {
        label: '🔒 Lock Now',
        click: () => this.callbacks.onLockNow?.(),
      },
      { type: 'separator' },
      {
        label: 'Open ProximityLock',
        click: () => this.callbacks.onOpenPrefs?.(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.callbacks.onQuit?.(),
      },
    ]);
    this.tray?.setContextMenu(menu);
  }
}

module.exports = { TrayManager, STATUS };
