(function() {
  'use strict';

  class DeviceList {
    constructor(listId, statusId) {
      this.listEl   = document.getElementById(listId);
      this.statusEl = document.getElementById(statusId);
      this.devices  = [];
      this.selectedId = null;
      this.onSelect = null;
      this._scanning = false;
    }

    setDevices(devices) {
      this.devices = devices;
      this._render();
    }

    setSelectedId(id) {
      this.selectedId = id;
      this._render();
    }

    setScanning(scanning) {
      this._scanning = scanning;
      if (this.statusEl) {
        this.statusEl.textContent = scanning ? 'Scanning…' : `${this.devices.length} device(s) found`;
      }
    }

    _deviceIcon(name) {
      const lower = (name || '').toLowerCase();
      if (lower.includes('watch'))   return '⌚';
      if (lower.includes('iphone'))  return '📱';
      if (lower.includes('ipad'))    return '📱';
      if (lower.includes('macbook')) return '💻';
      if (lower.includes('airpod'))  return '🎧';
      return '📡';
    }

    _render() {
      if (this.devices.length === 0) {
        this.listEl.innerHTML = `<div class="empty-state">${this._scanning ? 'Scanning for devices…' : 'No devices found. Click Scan.'}</div>`;
        return;
      }

      const sorted = [...this.devices].sort((a, b) => b.rssi - a.rssi);

      this.listEl.innerHTML = sorted.map(d => `
        <div class="device-item ${d.id === this.selectedId ? 'selected' : ''}" data-id="${d.id}" data-name="${d.name}">
          <span class="device-icon">${this._deviceIcon(d.name)}</span>
          <div class="device-info">
            <div class="device-name">${d.name}</div>
            <div class="device-addr">${d.address || d.id}</div>
          </div>
          <span class="device-rssi">${d.rssi} dBm</span>
        </div>
      `).join('');

      this.listEl.querySelectorAll('.device-item').forEach(el => {
        el.addEventListener('click', () => {
          const id   = el.dataset.id;
          const name = el.dataset.name;
          this.selectedId = id;
          this._render();
          this.onSelect?.({ id, name });
        });
      });
    }
  }

  window.DeviceList = DeviceList;
})();
