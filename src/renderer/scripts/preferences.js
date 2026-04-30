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

  // ── Camera mode state ────────────────────────────────────────────────────────
  let lockMode     = 'bluetooth';
  let faceDetector = null;
  let cameraActive = false;
  let noFaceAt     = null;
  let lastCameraLockAt     = 0;
  let cameraTimerUpdateId  = null;
  const CAMERA_LOCK_COOLDOWN_MS = 30000;

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

  function updatePauseBtn(paused) {
    const btn = $('pause-btn');
    if (paused) {
      btn.textContent = '▶ Resume Monitoring';
      btn.className = 'btn btn-success';
    } else {
      btn.textContent = '⏸ Pause Monitoring';
      btn.className = 'btn btn-warning';
    }
  }

  function rssiToDistanceLabel(dBm) {
    const v = parseInt(dBm, 10);
    if (v >= -55) return '≈ 0.5 m';
    if (v >= -60) return '≈ 1 m';
    if (v >= -65) return '≈ 1.5 m';
    if (v >= -70) return '≈ 2.5 m';
    if (v >= -75) return '≈ 3 m';
    if (v >= -80) return '≈ 4 m';
    return '≈ 5 m';
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

  // ── Lock mode ──────────────────────────────────────────────────────────────

  function applyLockModeUI(mode) {
    document.querySelectorAll('.bt-only').forEach(el => {
      el.style.display = mode === 'bluetooth' ? '' : 'none';
    });
    document.querySelectorAll('.camera-only').forEach(el => {
      el.style.display = mode === 'camera' ? '' : 'none';
    });
    $('mode-bt').classList.toggle('active', mode === 'bluetooth');
    $('mode-camera').classList.toggle('active', mode === 'camera');
  }

  function onFaceStatus({ detected, recognized, similarity }) {
    const now = Date.now();
    const statusEl = $('detection-status-text');
    const timerEl  = $('detection-timer');

    if (recognized) {
      noFaceAt = null;
      if (statusEl) {
        statusEl.textContent = `You ✅ ${similarity ? similarity + '% match' : ''}`;
        statusEl.className = 'detection-status-text face-detected';
      }
      if (timerEl)  timerEl.textContent = '';
      return;
    }

    if (detected && !recognized) {
      // Face detected but not yours
      if (!noFaceAt) noFaceAt = now;
      if (statusEl) { statusEl.textContent = 'Unknown face ⚠️'; statusEl.className = 'detection-status-text no-face'; }
    } else {
      if (!noFaceAt) noFaceAt = now;
      if (statusEl) { statusEl.textContent = 'No face detected ⚠️'; statusEl.className = 'detection-status-text no-face'; }
    }

    const elapsed           = (now - noFaceAt) / 1000;
    const lockDelaySec      = parseFloat($('camera-lock-delay').value);
    const cooldownRemaining = CAMERA_LOCK_COOLDOWN_MS - (now - lastCameraLockAt);

    if (elapsed >= lockDelaySec && cooldownRemaining <= 0) {
      lastCameraLockAt = now;
      noFaceAt = now; // reset to prevent immediate re-lock on next tick
      api.lockNow();
    }
  }

  function startCameraTimerUpdate() {
    if (cameraTimerUpdateId) return;
    cameraTimerUpdateId = setInterval(() => {
      if (!noFaceAt) return;
      const elapsed = Math.floor((Date.now() - noFaceAt) / 1000);
      const timerEl = $('detection-timer');
      if (timerEl) timerEl.textContent = `${elapsed}s`;
    }, 500);
  }

  function stopCameraTimerUpdate() {
    if (cameraTimerUpdateId) { clearInterval(cameraTimerUpdateId); cameraTimerUpdateId = null; }
  }

  function showEnrolledFace(photoDataUrl) {
    const container = $('enrolled-photo-container');
    const prompt = $('enroll-prompt');
    const reBtn = $('re-enroll-btn');
    const photo = $('enrolled-photo');
    if (photoDataUrl && container) {
      photo.src = photoDataUrl;
      container.style.display = '';
      if (prompt) prompt.style.display = 'none';
      if (reBtn) reBtn.style.display = '';
    }
  }

  async function enrollFace() {
    if (!faceDetector || !faceDetector.initialized) {
      alert('Camera not ready yet');
      return;
    }
    const btn = $('enroll-btn');
    if (btn) btn.textContent = 'Capturing...';
    try {
      const result = await faceDetector.enroll();
      await api.faceEnroll({ descriptor: result.descriptor, photo: result.photo });
      showEnrolledFace(result.photo);
      console.log('[Enroll] Success, confidence:', result.confidence);
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) btn.textContent = '📸 Take Photo';
    }
  }

  function updateCameraPreviewVisibility() {
    const video = $('camera-preview-video');
    if (!video) return;
    const showEl = $('show-camera-preview');
    video.style.display = (showEl && showEl.checked) ? '' : 'none';
  }

  async function startCameraMode() {
    if (cameraActive) return;
    cameraActive = true;
    noFaceAt = null;

    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Initializing camera…'; statusEl.className = 'detection-status-text'; }

    try {
      if (!faceDetector) {
        faceDetector = new FaceDetector();
        if (statusEl) statusEl.textContent = 'Loading face detection models…';
        await faceDetector.init($('camera-preview-video'));
      }

      // Load saved face descriptor if available
      const faceData = await api.faceGet();
      if (faceData && faceData.descriptor) {
        faceDetector.loadDescriptor(faceData.descriptor);
        showEnrolledFace(faceData.photo);
      }

      faceDetector.onFaceStatus = onFaceStatus;
      const intervalMs = parseFloat($('camera-check-interval').value || '1') * 1000;
      await faceDetector.start(intervalMs);

      if (statusEl) { statusEl.textContent = 'Detecting…'; statusEl.className = 'detection-status-text'; }
      startCameraTimerUpdate();
      updateCameraPreviewVisibility();
    } catch (err) {
      console.error('[Camera Mode] Failed to start:', err.message);
      cameraActive = false;
      if (statusEl) { statusEl.textContent = 'Error: ' + err.message; statusEl.className = 'detection-status-text error'; }
    }
  }

  function stopCameraMode() {
    cameraActive = false;
    noFaceAt = null;
    if (faceDetector) faceDetector.stop();
    stopCameraTimerUpdate();
    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Camera inactive'; statusEl.className = 'detection-status-text'; }
    const timerEl = $('detection-timer');
    if (timerEl) timerEl.textContent = '';
  }

  async function setLockMode(mode) {
    lockMode = mode;
    applyLockModeUI(mode);
    if (mode === 'camera') {
      await startCameraMode();
    } else {
      stopCameraMode();
    }
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

    try {
      const known = await api.getDevices();
      known.forEach(d => { latestDeviceMap[d.id] = d; });
    } catch (_) {}

    deviceList  = new DeviceList('device-list-el', 'scan-status');
    signalMeter = new SignalMeter('signal-meter-el');

    deviceList.setSelectedId(prefs.selectedDeviceId);
    deviceList.setSavedIds(new Set(savedDevices.map(d => d.id)));

    deviceList.onSelect = async ({ id, name }) => {
      savedDevices = await api.saveDevice({ id, name });
      await activateDevice(id, name);
      deviceList.setSavedIds(new Set(savedDevices.map(d => d.id)));
      closeScanPanel();
    };

    // BT sliders
    $('rssi-threshold').value  = prefs.rssiThreshold;
    $('rssi-val').textContent  = rssiLabel(prefs.rssiThreshold);
    $('lock-delay').value      = prefs.lockDelaySec;
    $('delay-val').textContent = delayLabel(prefs.lockDelaySec);
    updateSliderFill($('rssi-threshold'));
    updateSliderFill($('lock-delay'));

    // App behavior toggles
    $('start-on-login').checked  = prefs.startOnLogin;
    $('menu-bar-only').checked   = prefs.menuBarOnly;
    $('show-in-dock').checked    = prefs.showInDock;
    $('start-minimized').checked = prefs.startMinimized;
    $('notifications').checked   = prefs.notifications;

    // Camera sliders / toggles
    const camDelay    = prefs.cameraLockDelay    ?? 5;
    const camInterval = prefs.cameraCheckInterval ?? 1;
    const showPreview = prefs.showCameraPreview   !== false;
    $('camera-lock-delay').value         = camDelay;
    $('camera-lock-delay-val').textContent = camDelay + ' s';
    $('camera-check-interval').value     = camInterval;
    $('camera-check-interval-val').textContent = camInterval.toFixed(1) + ' s';
    $('show-camera-preview').checked     = showPreview;
    updateSliderFill($('camera-lock-delay'));
    updateSliderFill($('camera-check-interval'));

    // Lock mode (apply UI immediately, then start camera if needed)
    lockMode = prefs.lockMode || 'bluetooth';
    applyLockModeUI(lockMode);

    renderSavedDevices();

    api.onDevicesUpdated(devices => {
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

    // Start camera mode after UI is ready (if prefs say camera)
    if (lockMode === 'camera') {
      startCameraMode();
    }

    window.addEventListener('beforeunload', () => {
      if (scanTimer)  { clearTimeout(scanTimer);  scanTimer  = null; }
      if (pollTimer)  { clearInterval(pollTimer);  pollTimer  = null; }
      stopCameraMode();
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
    // BT sliders
    $('rssi-threshold').addEventListener('input', e => {
      $('rssi-val').textContent = rssiLabel(e.target.value);
      updateSliderFill(e.target);
    });
    $('lock-delay').addEventListener('input', e => {
      $('delay-val').textContent = delayLabel(e.target.value);
      updateSliderFill(e.target);
    });

    // Camera sliders
    $('camera-lock-delay').addEventListener('input', e => {
      $('camera-lock-delay-val').textContent = e.target.value + ' s';
      updateSliderFill(e.target);
    });
    $('camera-check-interval').addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      $('camera-check-interval-val').textContent = val.toFixed(1) + ' s';
      updateSliderFill(e.target);
      if (faceDetector && faceDetector.detecting) {
        faceDetector.setCheckInterval(val * 1000);
      }
    });
    $('show-camera-preview').addEventListener('change', updateCameraPreviewVisibility);

    // Mode buttons
    $('mode-bt').addEventListener('click',     () => setLockMode('bluetooth'));
    $('mode-camera').addEventListener('click', () => setLockMode('camera'));

    // Scan
    $('scan-btn').addEventListener('click', () => {
      if (scanning) stopScan(); else startScan();
    });

    $('lock-now-btn').addEventListener('click', () => api.lockNow());
    $('save-btn').addEventListener('click', save);

    // Pause/Resume
    let monitoringPaused = !prefs.enabled;
    updatePauseBtn(monitoringPaused);
    $('pause-btn').addEventListener('click', async () => {
      const newEnabled = await api.enableToggle();
      monitoringPaused = !newEnabled;
      updatePauseBtn(monitoringPaused);
    });

    $('show-unnamed').addEventListener('change', e => {
      deviceList.setShowUnnamed(e.target.checked);
    });

    $('add-device-btn').addEventListener('click', openScanPanel);
    $('scan-close-btn').addEventListener('click', closeScanPanel);
    $('scan-overlay').addEventListener('click', e => {
      if (e.target === $('scan-overlay')) closeScanPanel();
    });

    // Face enrollment buttons
    if ($('enroll-btn')) {
      $('enroll-btn').addEventListener('click', enrollFace);
    }
    if ($('re-enroll-btn')) {
      $('re-enroll-btn').addEventListener('click', async () => {
        $('enrolled-photo-container').style.display = 'none';
        $('enroll-prompt').style.display = '';
        $('re-enroll-btn').style.display = 'none';
        await enrollFace();
      });
    }
  }

  async function pollDevices() {
    try {
      const devices = await api.getDevices();
      if (devices && devices.length > 0) {
        devices.forEach(d => { latestDeviceMap[d.id] = d; });
        deviceList.setDevices(devices);
        renderSavedDevices();
      }
    } catch (_) {}
  }

  async function startScan() {
    if (scanTimer) { clearTimeout(scanTimer);  scanTimer = null; }
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
    if (scanTimer) { clearTimeout(scanTimer);  scanTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    scanning = false;
    $('scan-btn').textContent = 'Scan';
    deviceList.setScanning(false);
    await api.stopScan();
    await pollDevices();
  }

  async function save() {
    const updated = {
      rssiThreshold:       parseInt($('rssi-threshold').value, 10),
      lockDelaySec:        parseInt($('lock-delay').value, 10),
      startOnLogin:        $('start-on-login').checked,
      menuBarOnly:         $('menu-bar-only').checked,
      showInDock:          $('show-in-dock').checked,
      startMinimized:      $('start-minimized').checked,
      notifications:       $('notifications').checked,
      lockMode:            lockMode,
      cameraLockDelay:     parseFloat($('camera-lock-delay').value),
      cameraCheckInterval: parseFloat($('camera-check-interval').value),
      showCameraPreview:   $('show-camera-preview').checked,
    };
    await api.savePreferences(updated);
    const btn = $('save-btn');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save'; }, 1500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
