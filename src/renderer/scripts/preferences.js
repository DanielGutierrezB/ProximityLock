(function() {
  'use strict';

  const api = window.proximityLock;
  let deviceList, signalMeter;
  let scanning = false;
  let prefs = {};

  function $(id) { return document.getElementById(id); }

  function rssiLabel(v) { return `${v} dBm`; }
  function delayLabel(v) { return `${v}s`; }

  async function init() {
    prefs = await api.getPreferences();

    deviceList  = new DeviceList('device-list-el', 'scan-status');
    signalMeter = new SignalMeter('signal-meter-el');

    deviceList.setSelectedId(prefs.selectedDeviceId);

    deviceList.onSelect = async ({ id, name }) => {
      await api.selectDevice({ id, name });
      prefs.selectedDeviceId   = id;
      prefs.selectedDeviceName = name;
    };

    // Populate controls
    $('rssi-threshold').value  = prefs.rssiThreshold;
    $('rssi-val').textContent  = rssiLabel(prefs.rssiThreshold);
    $('lock-delay').value      = prefs.lockDelaySec;
    $('delay-val').textContent = delayLabel(prefs.lockDelaySec);

    $('start-on-login').checked  = prefs.startOnLogin;
    $('menu-bar-only').checked   = prefs.menuBarOnly;
    $('show-in-dock').checked    = prefs.showInDock;
    $('start-minimized').checked = prefs.startMinimized;
    $('notifications').checked   = prefs.notifications;

    bindEvents();
    startScan();

    api.onDevicesUpdated(devices => deviceList.setDevices(devices));
    api.onRssiUpdate(({ rssi, status }) => signalMeter.update(rssi, status));
  }

  function bindEvents() {
    $('rssi-threshold').addEventListener('input', e => {
      $('rssi-val').textContent = rssiLabel(e.target.value);
    });
    $('lock-delay').addEventListener('input', e => {
      $('delay-val').textContent = delayLabel(e.target.value);
    });
    $('scan-btn').addEventListener('click', () => {
      if (scanning) stopScan(); else startScan();
    });
    $('lock-now-btn').addEventListener('click', () => api.lockNow());
    $('save-btn').addEventListener('click', save);
  }

  async function startScan() {
    scanning = true;
    $('scan-btn').textContent = 'Stop';
    deviceList.setScanning(true);
    await api.startScan();
    // auto-stop after 15s
    setTimeout(stopScan, 15000);
  }

  async function stopScan() {
    scanning = false;
    $('scan-btn').textContent = 'Scan';
    deviceList.setScanning(false);
    await api.stopScan();
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
