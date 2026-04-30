(function() {
  'use strict';

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class DeviceList {
    constructor(listId, statusId) {
      this.listEl      = document.getElementById(listId);
      this.statusEl    = document.getElementById(statusId);
      this.devices     = [];
      this.selectedId  = null;
      this.savedIds    = new Set();
      this.onSelect    = null;
      this._scanning   = false;
      this.showUnnamed = false;
      this._renderTimer = null;
      this._deviceOrder = [];  // stable insertion order by id
    }

    setDevices(devices) {
      this.devices = devices;
      this._updateStatus();
      this._throttledRender();
    }

    _throttledRender() {
      if (this._renderTimer) return; // already scheduled
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._render();
      }, 3000);
    }

    setSelectedId(id) {
      this.selectedId = id;
      this._render();
    }

    setSavedIds(ids) {
      this.savedIds = ids instanceof Set ? ids : new Set(ids);
      this._render();
    }

    setScanning(scanning) {
      this._scanning = scanning;
      this._updateStatus();
      if (!scanning) this._render(); // render immediately when scan stops to show final state
    }

    setShowUnnamed(show) {
      this.showUnnamed = show;
      this._deviceOrder = []; // reset order when filter changes
      this._updateStatus();
      this._render(); // immediate for user action
    }

    _isNamed(device) {
      const name = device.name || '';
      if (!name || name === 'Unknown Device') return false;
      if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(name)) return false;
      return true;
    }

    _getVisibleDevices() {
      // Build stable order: keep existing order, append new devices at end sorted by RSSI
      const deviceMap = new Map(this.devices.map(d => [d.id, d]));
      const filtered = this.showUnnamed
        ? this.devices
        : this.devices.filter(d => this._isNamed(d));

      // Maintain stable order: keep known ids in place, add new ones at end
      const knownSet = new Set(this._deviceOrder);
      const newDevices = filtered.filter(d => !knownSet.has(d.id));
      // Sort new devices by RSSI (strongest first) before appending
      newDevices.sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));
      this._deviceOrder = [
        ...this._deviceOrder.filter(id => deviceMap.has(id)),
        ...newDevices.map(d => d.id)
      ];

      // Return devices in stable order
      const filteredIds = new Set(filtered.map(d => d.id));
      return this._deviceOrder
        .filter(id => filteredIds.has(id))
        .map(id => deviceMap.get(id))
        .filter(Boolean);
    }

    _updateStatus() {
      if (!this.statusEl) return;
      if (this._scanning) {
        this.statusEl.innerHTML = '<span class="spinner"></span>Scanning…';
      } else {
        const n = this._getVisibleDevices().length;
        this.statusEl.textContent = n > 0
          ? `Found ${n} device${n === 1 ? '' : 's'}`
          : 'No devices found. Click Scan.';
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

    _signalBars(rssi) {
      let bars, cls;
      if (rssi >= -60)      { bars = 4; cls = 'strong'; }
      else if (rssi >= -70) { bars = 3; cls = 'strong'; }
      else if (rssi >= -80) { bars = 2; cls = 'edge'; }
      else if (rssi >= -90) { bars = 1; cls = 'far'; }
      else                   { bars = 0; cls = ''; }

      return `<div class="signal-bars" title="${escHtml(String(rssi))} dBm">` +
        `<div class="bar b1 ${bars >= 1 ? cls : ''}"></div>` +
        `<div class="bar b2 ${bars >= 2 ? cls : ''}"></div>` +
        `<div class="bar b3 ${bars >= 3 ? cls : ''}"></div>` +
        `<div class="bar b4 ${bars >= 4 ? cls : ''}"></div>` +
        `</div>`;
    }

    _render() {
      const visible = this._getVisibleDevices();

      if (visible.length === 0) {
        this.listEl.innerHTML = `<div class="empty-state">${
          this._scanning ? 'Scanning for devices…' : 'No devices found. Click Scan.'
        }</div>`;
        return;
      }

      this.listEl.innerHTML = visible.map(d => {
        const named = this._isNamed(d);
        const nameHtml = named
          ? escHtml(d.name)
          : `<span class="unnamed-label">Unknown</span>`;
        const isSaved = this.savedIds.has(d.id);
        return `<div class="device-item ${d.id === this.selectedId ? 'selected' : ''}" data-id="${escHtml(d.id)}" data-name="${escHtml(d.name)}">` +
          `<span class="device-icon">${this._deviceIcon(d.name)}</span>` +
          `<div class="device-info">` +
          `<div class="device-name">${nameHtml}</div>` +
          `<div class="device-addr">${escHtml(d.address || d.id)}</div>` +
          `</div>` +
          this._signalBars(d.rssi ?? -100) +
          (isSaved ? `<span class="scan-saved-badge">Added</span>` : '') +
          `</div>`;
      }).join('');

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
