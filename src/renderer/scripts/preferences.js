'use strict';

(async function init() {
  const $ = id => document.getElementById(id);
  const api = window.proximityLock;
  const prefs = await api.getPreferences();

  let faceDetector = null;
  let cameraActive = false;
  let monitoring = prefs.enabled || false;
  let noFaceAt = null;
  let consecutiveMisses = 0;
  const MISS_THRESHOLD = 3;
  const CAMERA_LOCK_COOLDOWN_MS = 30000;
  let lastCameraLockAt = 0;
  let cameraTimerUpdateId = null;
  let previewOn = prefs.showCameraPreview || false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function delayLabel(v) { return `${v} s`; }
  function intervalLabel(v) { return `${v} s`; }

  function updateMonitoringBtn() {
    const btn = $('monitoring-toggle-btn');
    if (!btn) return;
    if (monitoring) {
      btn.textContent = '⏹ Stop Monitoring';
      btn.className = 'btn btn-sm btn-danger';
    } else {
      btn.textContent = '▶ Start Monitoring';
      btn.className = 'btn btn-sm btn-success';
    }
  }

  function updatePreviewUI() {
    const video = $('camera-preview-video');
    const off = $('cam-preview-off');
    const btn = $('preview-toggle-btn');
    if (previewOn && cameraActive) {
      video.style.display = '';
      off.style.display = 'none';
      btn.textContent = '👁 Preview On';
    } else {
      video.style.display = 'none';
      off.style.display = '';
      off.querySelector('.cam-off-text').textContent = cameraActive ? 'Preview off — detection active' : 'Camera off — click Start Monitoring';
      btn.textContent = '👁 Preview Off';
    }
  }

  // ── Face status ───────────────────────────────────────────────────────────

  function onFaceStatus({ detected, recognized, similarity }) {
    const now = Date.now();
    const statusEl = $('detection-status-text');
    const timerEl = $('detection-timer');

    if (recognized) {
      consecutiveMisses = 0;
      noFaceAt = null;
      if (statusEl) {
        statusEl.textContent = `You ✅ ${similarity ? similarity + '% match' : ''}`;
        statusEl.className = 'detection-status-text face-detected';
      }
      if (timerEl) timerEl.textContent = '';
      return;
    }

    consecutiveMisses++;

    if (consecutiveMisses < MISS_THRESHOLD) {
      if (statusEl) { statusEl.textContent = detected ? 'Verifying…' : 'Checking…'; statusEl.className = 'detection-status-text'; }
      return;
    }

    if (detected && !recognized) {
      if (!noFaceAt) noFaceAt = now;
      if (statusEl) { statusEl.textContent = 'Unknown face ⚠️'; statusEl.className = 'detection-status-text no-face'; }
    } else {
      if (!noFaceAt) noFaceAt = now;
      if (statusEl) { statusEl.textContent = 'No face detected ⚠️'; statusEl.className = 'detection-status-text no-face'; }
    }

    const elapsed = (now - noFaceAt) / 1000;
    const lockDelaySec = parseFloat($('camera-lock-delay').value);
    const cooldownRemaining = CAMERA_LOCK_COOLDOWN_MS - (now - lastCameraLockAt);

    if (elapsed >= lockDelaySec && cooldownRemaining <= 0) {
      lastCameraLockAt = now;
      noFaceAt = now;
      api.lockNow();
    }
  }

  function startTimerUpdate() {
    if (cameraTimerUpdateId) return;
    cameraTimerUpdateId = setInterval(() => {
      if (!noFaceAt) return;
      const elapsed = Math.floor((Date.now() - noFaceAt) / 1000);
      const timerEl = $('detection-timer');
      if (timerEl) timerEl.textContent = `${elapsed}s`;
    }, 500);
  }

  function stopTimerUpdate() {
    if (cameraTimerUpdateId) { clearInterval(cameraTimerUpdateId); cameraTimerUpdateId = null; }
  }

  // ── Camera control ────────────────────────────────────────────────────────

  async function populateCameraList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      const select = $('camera-select');
      const savedId = prefs.selectedCameraId || '';
      select.innerHTML = '<option value="">Select a camera…</option>';
      cameras.forEach((cam, i) => {
        const opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${i + 1}`;
        if (cam.deviceId === savedId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      console.error('[Camera] enumerate failed:', e.message);
    }
  }

  async function startCamera() {
    if (cameraActive) return;

    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Initializing…'; statusEl.className = 'detection-status-text'; }

    try {
      if (!faceDetector) {
        faceDetector = new FaceDetector();
        if (statusEl) statusEl.textContent = 'Loading models…';
        await faceDetector.init($('camera-preview-video'));
      }

      // Load saved face descriptor
      const faceData = await api.faceGet();
      if (faceData && faceData.descriptor) {
        faceDetector.loadDescriptor(faceData.descriptor);
        showEnrolledFace(faceData.photo);
      }

      faceDetector.onFaceStatus = onFaceStatus;
      const intervalMs = parseFloat($('camera-check-interval').value || '1') * 1000;
      const selectedCamera = $('camera-select')?.value || prefs.selectedCameraId || undefined;
      await faceDetector.start(intervalMs, selectedCamera);

      cameraActive = true;
      await populateCameraList();
      updatePreviewUI();
      startTimerUpdate();

      if (statusEl) { statusEl.textContent = 'Detecting…'; statusEl.className = 'detection-status-text'; }
    } catch (err) {
      console.error('[Camera] Failed:', err.message);
      cameraActive = false;
      if (statusEl) { statusEl.textContent = 'Error: ' + err.message; statusEl.className = 'detection-status-text error'; }
    }
  }

  function stopCamera() {
    if (faceDetector) faceDetector.stop();
    cameraActive = false;
    noFaceAt = null;
    consecutiveMisses = 0;
    stopTimerUpdate();
    updatePreviewUI();
    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Idle'; statusEl.className = 'detection-status-text'; }
    const timerEl = $('detection-timer');
    if (timerEl) timerEl.textContent = '';
  }

  // ── Enrollment ────────────────────────────────────────────────────────────

  function showEnrolledFace(photoDataUrl) {
    const container = $('enrolled-photo-container');
    const prompt = $('enroll-prompt');
    const photo = $('enrolled-photo');
    if (photoDataUrl && container) {
      photo.src = photoDataUrl;
      container.style.display = '';
      if (prompt) prompt.style.display = 'none';
    }
  }

  async function enrollFace() {
    if (!faceDetector || !faceDetector.initialized) {
      alert('Start monitoring first to enable the camera');
      return;
    }
    const btn = $('enroll-btn');
    if (btn) btn.textContent = 'Capturing…';
    try {
      const result = await faceDetector.enroll();
      await api.faceEnroll({ descriptor: result.descriptor, photo: result.photo });
      showEnrolledFace(result.photo);
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) btn.textContent = 'Take Photo';
    }
  }

  // ── Settings overlay ──────────────────────────────────────────────────────

  function toggleSettings() {
    const overlay = $('settings-overlay');
    overlay.classList.toggle('hidden');
  }

  // ── Init UI ───────────────────────────────────────────────────────────────

  // Sliders
  $('camera-lock-delay').value = prefs.cameraLockDelay || 10;
  $('camera-lock-delay-val').textContent = delayLabel(prefs.cameraLockDelay || 10);
  $('camera-check-interval').value = prefs.cameraCheckInterval || 1;
  $('camera-check-interval-val').textContent = intervalLabel(prefs.cameraCheckInterval || 1);

  // Toggles
  $('start-on-login').checked = prefs.startOnLogin || false;
  $('menu-bar-only').checked = prefs.menuBarOnly !== false;
  $('notifications').checked = prefs.notifications !== false;

  updateMonitoringBtn();
  updatePreviewUI();

  // Load enrolled face photo if exists
  const faceData = await api.faceGet();
  if (faceData && faceData.photo) {
    showEnrolledFace(faceData.photo);
  }

  // Populate camera list (doesn't start camera)
  await populateCameraList();

  // ── Event listeners ───────────────────────────────────────────────────────

  // Sliders
  $('camera-lock-delay').addEventListener('input', e => {
    $('camera-lock-delay-val').textContent = delayLabel(e.target.value);
  });
  $('camera-check-interval').addEventListener('input', e => {
    $('camera-check-interval-val').textContent = intervalLabel(e.target.value);
    if (faceDetector && faceDetector.detecting) {
      faceDetector.setCheckInterval(parseFloat(e.target.value) * 1000);
    }
  });

  // Camera selector
  $('camera-select').addEventListener('change', async () => {
    const camId = $('camera-select').value || '';
    api.savePreferences({ selectedCameraId: camId });
    prefs.selectedCameraId = camId;
    if (cameraActive && faceDetector) {
      faceDetector.stop();
      cameraActive = false;
      const intervalMs = parseFloat($('camera-check-interval').value || '1') * 1000;
      await faceDetector.start(intervalMs, camId || undefined);
      cameraActive = true;
      updatePreviewUI();
    }
  });

  // Start/Stop Monitoring
  $('monitoring-toggle-btn').addEventListener('click', async () => {
    if (!monitoring) {
      const camId = $('camera-select').value;
      if (!camId) {
        alert('Please select a camera first');
        return;
      }
      monitoring = true;
      await api.enableToggle();
      await startCamera();
    } else {
      monitoring = false;
      await api.enableToggle();
      stopCamera();
    }
    updateMonitoringBtn();
  });

  // Preview toggle
  $('preview-toggle-btn').addEventListener('click', () => {
    previewOn = !previewOn;
    api.savePreferences({ showCameraPreview: previewOn });
    updatePreviewUI();
  });

  // Lock Now
  $('lock-now-btn').addEventListener('click', () => api.lockNow());

  // Enrollment
  $('enroll-btn').addEventListener('click', enrollFace);
  $('re-enroll-btn').addEventListener('click', async () => {
    $('enrolled-photo-container').style.display = 'none';
    $('enroll-prompt').style.display = '';
    await enrollFace();
  });

  // Settings
  $('settings-gear-btn').addEventListener('click', toggleSettings);
  $('settings-close-btn').addEventListener('click', toggleSettings);
  $('settings-overlay').addEventListener('click', e => {
    if (e.target === $('settings-overlay')) toggleSettings();
  });
  $('settings-save-btn').addEventListener('click', () => {
    api.savePreferences({
      cameraLockDelay: parseFloat($('camera-lock-delay').value),
      cameraCheckInterval: parseFloat($('camera-check-interval').value),
      startOnLogin: $('start-on-login').checked,
      menuBarOnly: $('menu-bar-only').checked,
      notifications: $('notifications').checked,
    });
    toggleSettings();
  });

})();
