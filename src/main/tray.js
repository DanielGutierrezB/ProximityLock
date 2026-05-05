'use strict';

const { Tray, BrowserWindow, nativeImage, screen } = require('electron');
const path = require('path');

const STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  DISABLED: 'disabled',
  IDLE: 'idle',
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
  [STATUS.CONNECTED]:    createColorCircleIcon(52, 199, 89),
  [STATUS.DISCONNECTED]: createColorCircleIcon(255, 59, 48),
  [STATUS.DISABLED]:     createColorCircleIcon(142, 142, 147),
  [STATUS.IDLE]:         createColorCircleIcon(142, 142, 147),
};

const POPUP_WIDTH  = 280;
const POPUP_HEIGHT = 440;

class TrayManager {
  constructor() {
    this.tray = null;
    this.status = STATUS.IDLE;
    this.enabled = false;
    this.callbacks = {};
    this.popupWindow = null;
    this._lastBlurTime = 0;
  }

  init(callbacks) {
    this.callbacks = callbacks;
    this.tray = new Tray(ICON_CACHE[STATUS.IDLE]);
    this.tray.setToolTip('ProximityLock');
    this.tray.on('click', () => this._togglePopup());
    this.tray.on('right-click', () => this._togglePopup());
  }

  updateStatus(status) {
    this.status = status;
    this.tray?.setImage(ICON_CACHE[status] ?? ICON_CACHE[STATUS.IDLE]);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.tray?.setTitle('');
  }

  // Update the text shown next to the tray icon in the menu bar (macOS only)
  setTrayTitle(text) {
    if (process.platform === 'darwin') {
      this.tray?.setTitle(text, { fontType: 'monospacedDigit' });
    } else {
      // Windows: use tooltip instead
      this.tray?.setToolTip(text ? `ProximityLock — ${text}` : 'ProximityLock');
    }
  }

  sendFaceStatus(data) {
    this._lastFaceStatus = data;
    if (this.popupWindow && !this.popupWindow.isDestroyed() && this.popupWindow.isVisible()) {
      this.popupWindow.webContents.send('popup:face-status', data);
    }
  }

  sendToPopup(channel, data) {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.webContents.send(channel, data);
    }
  }

  _togglePopup() {
    // If popup just lost focus (user clicked tray to close it), don't reopen
    if (Date.now() - this._lastBlurTime < 300) return;

    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      if (this.popupWindow.isVisible()) {
        this.popupWindow.hide();
      } else {
        this._positionAndShow();
      }
    } else {
      this._createPopup();
    }
  }

  _createPopup() {
    this.popupWindow = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      fullscreenable: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    this.popupWindow.loadFile(path.join(__dirname, '../renderer/tray-popup.html'));

    this.popupWindow.on('blur', () => {
      this._lastBlurTime = Date.now();
      if (this.popupWindow && !this.popupWindow.isDestroyed()) {
        this.popupWindow.hide();
      }
    });
    this.popupWindow.on('closed', () => { this.popupWindow = null; });
    this.popupWindow.once('ready-to-show', () => {
      this._positionAndShow();
      // Push current state so the popup doesn't start stale
      this._syncStateToPopup();
    });
  }

  _syncStateToPopup() {
    if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
    this.popupWindow.webContents.send('popup:sync-state', {
      enabled: this.enabled,
      status: this.status,
      lastFaceStatus: this._lastFaceStatus || null,
    });
  }

  _positionAndShow() {
    if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
    const trayBounds = this.tray.getBounds();
    const { x: areaX, width: areaW } = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y,
    }).workArea;

    // Center popup horizontally on tray icon
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
    let y;

    if (process.platform === 'win32') {
      // Windows: tray is at the bottom, popup goes above
      y = Math.round(trayBounds.y - POPUP_HEIGHT - 4);
    } else {
      // macOS: tray is at the top, popup goes below
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    }

    // Clamp to screen horizontal bounds
    const { y: areaY, height: areaH } = screen.getDisplayNearestPoint({
      x: trayBounds.x, y: trayBounds.y,
    }).workArea;
    x = Math.max(areaX, Math.min(x, areaX + areaW - POPUP_WIDTH));
    y = Math.max(areaY, Math.min(y, areaY + areaH - POPUP_HEIGHT));

    this.popupWindow.setPosition(x, y, false);
    this.popupWindow.show();
    this.popupWindow.focus();
    this._syncStateToPopup();
  }
}

module.exports = { TrayManager, STATUS };
