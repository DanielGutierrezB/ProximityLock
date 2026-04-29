(function() {
  'use strict';

  class SignalMeter {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      this.rssi = null;
      this._render();
    }

    _render() {
      this.container.innerHTML = `
        <div class="signal-section">
          <div class="signal-header">
            <span class="signal-label">Signal Strength</span>
            <span class="rssi-value" id="rssi-dbm">— dBm</span>
          </div>
          <div class="rssi-bar-bg">
            <div class="rssi-bar-fill none" id="rssi-fill" style="width:0%"></div>
          </div>
          <div class="rssi-labels">
            <span>Very Close</span>
            <span>Close</span>
            <span>Medium</span>
            <span>Far</span>
          </div>
        </div>
      `;
      this.fillEl  = document.getElementById('rssi-fill');
      this.dbmEl   = document.getElementById('rssi-dbm');
    }

    update(rssi, status) {
      this.rssi = rssi;
      // Map RSSI -40 → 100%, -100 → 0%
      const clamped = Math.max(-100, Math.min(-40, rssi));
      const pct = Math.round(((clamped + 100) / 60) * 100);

      this.dbmEl.textContent = `${rssi} dBm`;
      this.fillEl.style.width = pct + '%';

      this.fillEl.className = 'rssi-bar-fill';
      if (rssi >= -60)       this.fillEl.classList.add('');       // green (default)
      else if (rssi >= -75)  this.fillEl.classList.add('edge');
      else                   this.fillEl.classList.add('far');
    }

    reset() {
      this.rssi = null;
      this.dbmEl.textContent = '— dBm';
      this.fillEl.style.width = '0%';
      this.fillEl.className = 'rssi-bar-fill none';
    }
  }

  window.SignalMeter = SignalMeter;
})();
