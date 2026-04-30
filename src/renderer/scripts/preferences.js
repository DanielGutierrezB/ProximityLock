(function() {
  'use strict';

  const api = window.proximityLock;
  let deviceList, signalMeter;
  let scanning = false;
  let scanTimer = null;
  let pollTimer = null;
  let prefs = {};
  let savedDevices = [];       // [{id, name, addedAt}]
  let activeDeviceId = null;
  let latestDeviceMap = {};    // id -> {rssi, ...} from scan

  function $(id) { return document.getElementById(id); }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function deviceIcon(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('watch'))   return '⌚';
    if (lower.includes('iphone'))  return '📱';
    if (lower.includes('ipad'))    return '📱';
    if (lower.includes('macbook')) return '💻';
    if (lower.includes('airpod'))  return '🎧';
    return '📡';
  }

  function signalBarsHtml(rssi) {
    let bars, cls;
    if (rssi >= -60)      { bars = 4; cls = 'strong'; }
    else if (rssi >= -70) { bars = 3; cls = 'strong'; }
    else if (rssi >= -80) { bars = 2; cls = 'edge'; }
    else if (rssi >= -90) { bars = 1; cls = 'far'; }
    else                   { bars = 0; cls = ''; }
    return `<div class="signal-bars">` +
      `<div class="bar b1 ${bars >= 1 ? cls : ''}"></div>` +
      `<div class="bar b2 ${bars >= 2 ? cls : ''}"></div>` +
      `<div class="bar b3 ${bars >= 3 ? cls : ''}"></div>` +
      `<div class="bar b4 ${bars >= 4 ? cls : ''}"></div>` +
      `</div>`;
  }

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

  // ── Saved Devices rendering ──

  function renderSavedDevices() {
    const el = $('saved-devices-list');
    if (!el) return;

    if (savedDevices.length === 0) {
      el.innerHTML = '<div class="saved-devices-empty">No devices saved yet.<br>Scan below and tap a device to add it.</div>';
      return;
    }

    el.innerHTML = savedDevices.map(d => {
      const isActive = d.id === activeDeviceId;
      const live = latestDeviceMap[d.id];
      const rssi = live ? live.rssi : null;
      const isConnected = rssi !== null && rssi > -100;
      let statusLabel;
      if (!isActive) {
        statusLabel = '<span class="device-status-label inactive">Inactive</span>';
      } else if (isConnected) {
        statusLabel = '<span class="device-status-label connected">Connected</span>';
      } else {
        statusLabel = '<span class="device-status-label searching">Searching…</span>';
      }
      return `<div class="saved-device-item ${isActive ? 'active' : ''}" data-id="${escHtml(d.id)}" data-name="${escHtml(d.name)}">` +
        `<div class="${isActive && isConnected ? 'saved-active-dot' : isActive ? 'saved-searching-dot' : 'saved-inactive-dot'}"></div>` +
        `<span class="device-icon">${deviceIcon(d.name)}</span>` +
        `<div class="saved-device-info">` +
        `<span class="saved-device-name">${escHtml(d.name || 'Unknown')}</span>` +
        statusLabel +
        `</div>` +
        (rssi !== null ? signalBarsHtml(rssi) : '<div class="signal-bars" style="opacity:0.3">' +
          '<div class="bar b1"></div><div class="bar b2"></div><div class="bar b3"></div><div class="bar b4"></div></div>') +
        `<button class="saved-device-remove" data-id="${escHtml(d.id)}" title="Remove">✕</button>` +
        `</div>`;
    }).join('');

    el.querySelectorAll('.saved-device-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.saved-device-remove')) return;
        activateDevice(item.dataset.id, item.dataset.name);
      });
    });

    el.querySelectorAll('.saved-device-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        savedDevices = await api.removeDevice({ id: btn.dataset.id });
        // If active device was removed, clear active state
        if (activeDeviceId === btn.dataset.id) {
          activeDeviceId = null;
          prefs.selectedDeviceId = '';
          prefs.selectedDeviceName = '';
        }
        deviceList.setSavedIds(new Set(savedDevices.map(d => d.id)));
        renderSavedDevices();
      });
    });
  }

  async function activateDevice(id, name) {
    await api.selectDevice({ id, name });
    activeDeviceId = id;
    prefs.selectedDeviceId = id;
    prefs.selectedDeviceName = name;
    deviceList.setSelectedId(id);
    renderSavedDevices();
  }

  // ── Collapsible sections ──

  function initCollapsible() {
    document.querySelectorAll('.settings-section[data-section]').forEach(section => {
      const id     = section.dataset.section;
      const header = section.querySelector('.section-header');
      const body   = section.querySelector('.section-body');
      if (!header || !body) return;

      const stored = localStorage.getItem(`section-collapsed-${id}`);
      let shouldCollapse = stored === 'true';

      // Default collapsed states (only when user hasn't set a preference)
      if (stored === null) {
        if (id === 'about') shouldCollapse = true;
        if (id === 'scan-add' && savedDevices.length > 0) shouldCollapse = true;
      }

      if (shouldCollapse) section.classList.add('collapsed');

      header.addEventListener('click', () => {
        const willCollapse = !section.classList.contains('collapsed');
        section.classList.toggle('collapsed');
        localStorage.setItem(`section-collapsed-${id}`, String(willCollapse));
      });
    });
  }

  // ── Init ──

  async function init() {
    try {
      prefs = await api.getPreferences();
    } catch (err) {
      prefs = {};
      return;
    }

    savedDevices   = Array.isArray(prefs.savedDevices) ? prefs.savedDevices : [];
    activeDeviceId = prefs.selectedDeviceId || null;

    // Build initial latestDeviceMap from any already-known devices
    try {
      const known = await api.getDevices();
      known.forEach(d => { latestDeviceMap[d.id] = d; });
    } catch (_) {}

    deviceList  = new DeviceList('device-list-el', 'scan-status');
    signalMeter = new SignalMeter('signal-meter-el');

    deviceList.setSelectedId(prefs.selectedDeviceId);
    deviceList.setSavedIds(new Set(savedDevices.map(d => d.id)));

    deviceList.onSelect = async ({ id, name }) => {
      // Save device to My Devices
      savedDevices = await api.saveDevice({ id, name });
      // Make it active
      await activateDevice(id, name);
      // Reflect saved state in scan list
      deviceList.setSavedIds(new Set(savedDevices.map(d => d.id)));
      // Close the scan panel after adding
      closeScanPanel();
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

    renderSavedDevices();

    // Register IPC listeners BEFORE starting scan
    api.onDevicesUpdated(devices => {
      console.log('[Renderer] Devices updated, count:', devices.length);
      devices.forEach(d => { latestDeviceMap[d.id] = d; });
      deviceList.setDevices(devices);
      renderSavedDevices();
    });

    api.onRssiUpdate(({ rssi, status }) => {
      signalMeter.update(rssi, status);
      if (activeDeviceId) {
        if (!latestDeviceMap[activeDeviceId]) latestDeviceMap[activeDeviceId] = {};
        latestDeviceMap[activeDeviceId].rssi = rssi;
        renderSavedDevices();
      }
    });

    bindEvents();
    initCollapsible();
    // Don't auto-scan — scan only when user opens the Add Device panel

    window.addEventListener('beforeunload', () => {
      if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    });
  }

  function openScanPanel() {
    $('scan-overlay').classList.remove('hidden');
    startScan();
  }

  function closeScanPanel() {
    $('scan-overlay').classList.add('hidden');
    stopScan();
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

    // Scan overlay open/close
    $('add-device-btn').addEventListener('click', openScanPanel);
    $('scan-close-btn').addEventListener('click', closeScanPanel);
    $('scan-overlay').addEventListener('click', e => {
      if (e.target === $('scan-overlay')) closeScanPanel();
    });
  }

  async function pollDevices() {
    try {
      const devices = await api.getDevices();
      if (devices && devices.length > 0) {
        console.log('[Renderer] Poll found', devices.length, 'devices');
        devices.forEach(d => { latestDeviceMap[d.id] = d; });
        deviceList.setDevices(devices);
        renderSavedDevices();
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
    pollTimer = setInterval(pollDevices, 2000);
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
