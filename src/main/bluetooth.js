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

    noble.on('stateChange', this._onStateChange.bind(this));
    noble.on('discover', this._onDiscover.bind(this));
    noble.on('scanStop', () => { this.scanning = false; });
  }

  _onStateChange(state) {
    this.bluetoothState = state;
    this.emit('stateChange', state);
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
    this.emit('deviceDiscovered', device);
    if (peripheral.id === this.monitoredDeviceId) {
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
  }

  getDeviceList() {
    // Filter out stale devices older than 30 seconds
    const cutoff = Date.now() - 30000;
    return Array.from(this.devices.values()).filter(d => d.lastSeen > cutoff);
  }

  clearDevices() {
    this.devices.clear();
    this.emit('devicesCleared');
  }
}

module.exports = new BluetoothManager();
