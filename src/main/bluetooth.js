'use strict';

const noble = require('@abandonware/noble');
const { EventEmitter } = require('events');

class BluetoothManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.scanning = false;
    this.monitoredDeviceId = null;
    this.bluetoothState = 'unknown';
    this._lastMonitoredSeen = 0;     // timestamp of last monitored device sighting
    this._signalLostTimer = null;    // fires when no signal for too long
    this._signalLostTimeout = 8000;  // 8 seconds without signal = device gone

    noble.on('stateChange', this._onStateChange.bind(this));
    noble.on('discover', this._onDiscover.bind(this));
    noble.on('scanStop', () => { this.scanning = false; });
  }

  _onStateChange(state) {
    console.log('[BLE] State changed:', state);
    this.bluetoothState = state;
    this.emit('stateChange', state);
    // Auto-scan on startup for monitoring active device
    if (state === 'poweredOn') {
      this.startScanning();
    }
  }

  _onDiscover(peripheral) {
    const device = {
      id: peripheral.id,
      name: peripheral.advertisement?.localName || peripheral.address || 'Unknown Device',
      rssi: peripheral.rssi,
      address: peripheral.address,
      lastSeen: Date.now(),
    };
    this.devices.set(peripheral.id, device);
    // Only log monitored device to reduce noise
    if (peripheral.id === this.monitoredDeviceId) {
      console.log('[BLE] Monitored:', device.name, 'RSSI:', device.rssi);
    }
    this.emit('deviceDiscovered', device);
    if (peripheral.id === this.monitoredDeviceId) {
      this._lastMonitoredSeen = Date.now();
      this._resetSignalLostTimer();
      this.emit('rssiUpdate', device);
    }
  }

  startScanning() {
    if (this.bluetoothState !== 'poweredOn') return;
    if (this.scanning) return;
    try {
      noble.startScanning([], true);
      this.scanning = true;
      this.emit('scanStarted');
    } catch (err) {
      console.error('BLE startScanning error:', err.message);
    }
  }

  stopScanning() {
    if (!this.scanning) return;
    noble.stopScanning();
    this.scanning = false; // set synchronously so callers can restart immediately
    this.emit('scanStopped');
  }

  setMonitoredDevice(deviceId) {
    this.monitoredDeviceId = deviceId;
    this._lastMonitoredSeen = 0;
    this._resetSignalLostTimer();
  }

  _resetSignalLostTimer() {
    if (this._signalLostTimer) clearTimeout(this._signalLostTimer);
    if (!this.monitoredDeviceId) return;
    this._signalLostTimer = setTimeout(() => {
      console.log('[BLE] Signal LOST for', this.monitoredDeviceId, '- no signal for', this._signalLostTimeout / 1000, 's');
      this.emit('signalLost', { id: this.monitoredDeviceId });
    }, this._signalLostTimeout);
  }

  getLastSeenMs() {
    if (!this._lastMonitoredSeen) return Infinity;
    return Date.now() - this._lastMonitoredSeen;
  }

  getDeviceList() {
    // Filter out stale devices older than 60 seconds
    const cutoff = Date.now() - 60000;
    const all = Array.from(this.devices.values());
    const fresh = all.filter(d => d.lastSeen > cutoff);
    return fresh;
  }

  clearDevices() {
    this.devices.clear();
    this.emit('devicesCleared');
  }
}

module.exports = new BluetoothManager();
