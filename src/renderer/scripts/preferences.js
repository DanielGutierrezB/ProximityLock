(function() {
  'use strict';

  const api = window.proximityLock;
  let deviceList, signalMeter;
  let scanning = false;
  let scanTimer = null;
  let pollTimer = null;
  let prefs = {};

  function $(id) { return document.getElementById(id); }

  function delayLabel(v) { return `${v} s`; }

  function rssiToDistanceLabel(dBm) {
    const v = parseInt(dBm, 10);
    if (v >= -50) return '≈ 1 meter';
    if (v >= -60) return '≈ 2 meters';
    if (v >= -70) return '≈ 5 meters';
    if (v >= -80) return '≈ 8 meters';
    return '≈ 10+ meters';
  }

  function rssiLabel(v) {
    return `${rssiToDistanceLabel(v)} (${v} dBm)`;
  }

  function updateSliderFill(el) {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
    el.style.background = `linear-gradient(to right, #007aff 0%, #007aff ${pct}%, var(--toggle-off) ${pct}%, var(--toggle-off) 100%)`;
  }

  function initCollapsible() {
    document.querySelectorAll('.settings-section[data-section]').forEach(section => {
      const id     = section.dataset.section;
      const header = section.querySelector('.section-header');
      const body   = section.querySelector('.section-body');
      if (!header || !body) return;

      if (localStorage.getItem(`section-collapsed-${id}`) === 'true') {
        section.classList.add('collapsed');
      }

      header.addEventListener('click', () => {
        const willCollapse = !section.classList.contains('collapsed');
        section.classList.toggle('collapsed');
        localStorage.setItem(`section-collapsed-${id}`, String(willCollapse));
      });
    });
  }

  async function init() {
    try {
      prefs = await api.getPreferences();
    } catch (err) {
      prefs = {};
      return;
    }

    deviceList  = new DeviceList('device-list-el', 'scan-status');
    signalMeter = new SignalMeter('signal-meter-el');

    deviceList.setSelectedId(prefs.selectedDeviceId);

    deviceList.onSelect = async ({ id, name }) => {
      await api.selectDevice({ id, name });
      prefs.selectedDeviceId   = id;
      prefs.selectedDeviceName = name;
    };

    $('rssi-threshold').value  = prefs.rssiThreshold;
    $('rssi-val').textContent  = rssiLabel(prefs.rssiThreshold);
    $('lock-delay').value      = prefs.lockDelaySec;
    $('delay-val').textContent = delayLabel(prefs.lockDelaySec);
    updateSliderFill($('rssi-threshold'));
    updateSliderFill($('lock-delay'));

    $('start-on-login').checked  = prefs.startOnLogin;
    $('menu-bar-only').checked   = prefs.menuBarOnly;
    $('show-in-dock').checked    = prefs.showInDock;
    $('start-minimized').checked = prefs.startMinimized;
    $('notifications').checked   = prefs.notifications;

    // Register IPC listeners BEFORE starting scan to avoid missing early events
    api.onDevicesUpdated(devices => {
      console.log('[Renderer] Devices updated, count:', devices.length, devices.filter(d => d.name && d.name !== 'Unknown Device').map(d => d.name));
      deviceList.setDevices(devices);
    });
    api.onRssiUpdate(({ rssi, status }) => signalMeter.update(rssi, status));

    bindEvents();
    initCollapsible();
    await startScan();

    window.addEventListener('beforeunload', () => {
      if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    });
  }

  function bindEvents() {
    $('rssi-threshold').addEventListener('input', e => {
      $('rssi-val').textContent = rssiLabel(e.target.value);
      updateSliderFill(e.target);
    });
    $('lock-delay').addEventListener('input', e => {
      $('delay-val').textContent = delayLabel(e.target.value);
      updateSliderFill(e.target);
    });
    $('scan-btn').addEventListener('click', () => {
      if (scanning) stopScan(); else startScan();
    });
    $('lock-now-btn').addEventListener('click', () => api.lockNow());
    $('save-btn').addEventListener('click', save);
    $('show-unnamed').addEventListener('change', e => {
      deviceList.setShowUnnamed(e.target.checked);
    });
  }

  async function pollDevices() {
    try {
      const devices = await api.getDevices();
      if (devices && devices.length > 0) {
        console.log('[Renderer] Poll found', devices.length, 'devices');
        deviceList.setDevices(devices);
      }
    } catch (_) {}
  }

  async function startScan() {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    scanning = true;
    $('scan-btn').textContent = 'Stop';
    deviceList.setScanning(true);
    await api.startScan();
    // Poll for devices every 2s as fallback (IPC push may miss events)
    pollTimer = setInterval(pollDevices, 2000);
    // Also fetch immediately
    setTimeout(pollDevices, 500);
    scanTimer = setTimeout(() => { scanTimer = null; stopScan(); }, 15000);
  }

  async function stopScan() {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    scanning = false;
    $('scan-btn').textContent = 'Scan';
    deviceList.setScanning(false);
    await api.stopScan();
    // Final poll to get latest state
    await pollDevices();
  }

  async function save() {
    const updated = {
      rssiThreshold:  parseInt($('rssi-threshold').value, 10),
      lockDelaySec:   parseInt($('lock-delay').value, 10),
      startOnLogin:   $('start-on-login').checked,
      menuBarOnly:    $('menu-bar-only').checked,
      showInDock:     $('show-in-dock').checked,
      startMinimized: $('start-minimized').checked,
      notifications:  $('notifications').checked,
    };
    await api.savePreferences(updated);
    const btn = $('save-btn');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save'; }, 1500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
