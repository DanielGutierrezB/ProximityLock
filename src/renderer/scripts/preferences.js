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
  const CAMERA_LOCK_COOLDOWN_MS = 15000;
  let lastCameraLockAt = 0;
  let cameraTimerUpdateId = null;
  let previewOn = prefs.showCameraPreview !== false;
  let lastFaceRecognized = false;
  let lastSimilarity = 0;
  let noFaceLabel = 'No face ⚠️';
  let wasRunningBeforeLock = false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function delayLabel(v) { return `${v} s`; }
  function intervalLabel(v) { return `${v} s`; }

  function updateMonitoringBtn() {
    const btn = $('monitoring-toggle-btn');
    if (!btn) return;
    if (!monitoring) {
      btn.textContent = '▶ Start Monitoring';
      btn.className = 'btn btn-sm btn-success';
      return;
    }
    if (!cameraActive) {
      btn.textContent = '⏹ Stop Monitoring';
      btn.className = 'btn btn-sm btn-secondary';
      return;
    }
    if (lastFaceRecognized) {
      btn.textContent = `🟢 Matched ${lastSimilarity}%`;
      btn.className = 'btn btn-sm btn-success';
    } else if (noFaceAt) {
      const elapsed = (Date.now() - noFaceAt) / 1000;
      const lockDelaySec = parseFloat($('camera-lock-delay').value);
      const remaining = Math.max(0, Math.ceil(lockDelaySec - elapsed));
      btn.textContent = `🔴 Locking in ${remaining}s…`;
      btn.className = 'btn btn-sm btn-danger';
    } else {
      btn.textContent = '⏹ Stop Monitoring';
      btn.className = 'btn btn-sm btn-secondary';
    }
  }

  function updatePreviewUI() {
    const video = $('camera-preview-video');
    const off = $('cam-preview-off');
    const btn = $('preview-toggle-btn');
    const offText = off ? off.querySelector('.cam-off-text') : null;
    if (previewOn && cameraActive) {
      if (video) video.style.display = '';
      if (off) off.style.display = 'none';
      if (btn) btn.textContent = '👁 Preview On';
    } else {
      if (video) video.style.display = 'none';
      if (off) off.style.display = '';
      if (offText) offText.textContent = cameraActive ? 'Preview off — detection active' : 'Camera off — click Start Monitoring';
      if (btn) btn.textContent = '👁 Preview Off';
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
      lastFaceRecognized = true;
      lastSimilarity = similarity || 0;
      if (statusEl) {
        statusEl.textContent = `You ✅ ${similarity ? similarity + '% match' : ''}`;
        statusEl.className = 'detection-status-text face-detected';
      }
      if (timerEl) timerEl.textContent = '';
      api.faceStatus({ matched: true, similarity: similarity || 0 });
      updateMonitoringBtn();
      return;
    }

    if (consecutiveMisses >= MISS_THRESHOLD) {
      const lockDelay = parseFloat($('camera-lock-delay').value);
      const cd = noFaceAt ? Math.max(0, Math.ceil(lockDelay - (now - noFaceAt) / 1000)) : lockDelay;
      api.faceStatus({ matched: false, similarity: 0, countdown: cd });
    }

    consecutiveMisses++;

    if (consecutiveMisses < MISS_THRESHOLD) {
      if (statusEl) { statusEl.textContent = detected ? 'Verifying…' : 'Checking…'; statusEl.className = 'detection-status-text'; }
      return;
    }

    lastFaceRecognized = false;
    lastSimilarity = 0;
    noFaceLabel = detected ? 'Unknown face ⚠️' : 'No face ⚠️';

    if (!noFaceAt) noFaceAt = now;
    const elapsedS = Math.floor((now - noFaceAt) / 1000);

    if (statusEl) {
      statusEl.textContent = `${noFaceLabel} ${elapsedS}s`;
      statusEl.className = 'detection-status-text no-face';
    }
    if (timerEl) timerEl.textContent = '';

    updateMonitoringBtn();

    const elapsed = (now - noFaceAt) / 1000;
    const lockDelaySec = parseFloat($('camera-lock-delay').value);
    const cooldownRemaining = CAMERA_LOCK_COOLDOWN_MS - (now - lastCameraLockAt);

    if (monitoring && elapsed >= lockDelaySec && cooldownRemaining <= 0) {
      lastCameraLockAt = now;
      noFaceAt = now;
      api.lockNow();
    }
  }

  function startTimerUpdate() {
    if (cameraTimerUpdateId) return;
    cameraTimerUpdateId = setInterval(() => {
      if (noFaceAt && !lastFaceRecognized) {
        const elapsed = Math.floor((Date.now() - noFaceAt) / 1000);
        const statusEl = $('detection-status-text');
        if (statusEl && statusEl.classList.contains('no-face')) {
          statusEl.textContent = `${noFaceLabel} ${elapsed}s`;
        }
      }
      if (monitoring) updateMonitoringBtn();
    }, 500);
  }

  function stopTimerUpdate() {
    if (cameraTimerUpdateId) { clearInterval(cameraTimerUpdateId); cameraTimerUpdateId = null; }
  }

  // ── Camera control ────────────────────────────────────────────────────────

  async function populateCameraList() {
    try {
      let tempStream = null;
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (_) {}

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');

      if (tempStream) {
        tempStream.getTracks().forEach(t => t.stop());
      }

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
      console.log('[Camera] Found', cameras.length, 'cameras');
    } catch (e) {
      console.error('[Camera] enumerate failed:', e.message);
    }
  }

  async function startCamera() {
    console.log('[UI] startCamera called, cameraActive:', cameraActive);
    if (cameraActive) return;

    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Initializing…'; statusEl.className = 'detection-status-text'; }

    try {
      if (!faceDetector) {
        faceDetector = new FaceDetector();
        if (statusEl) statusEl.textContent = 'Loading models…';
        await faceDetector.init($('camera-preview-video'));
      }

      const faceData = await api.faceGet();
      if (faceData && faceData.descriptor) {
        faceDetector.loadDescriptor(faceData.descriptor);
        showEnrolledFace(faceData.photo);
      }

      faceDetector.SIMILARITY_THRESHOLD = (prefs.matchThreshold || 35) / 100;
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
    lastFaceRecognized = false;
    lastSimilarity = 0;
    stopTimerUpdate();
    updatePreviewUI();
    const statusEl = $('detection-status-text');
    if (statusEl) { statusEl.textContent = 'Idle'; statusEl.className = 'detection-status-text'; }
    const timerEl = $('detection-timer');
    if (timerEl) timerEl.textContent = '';
    updateMonitoringBtn();
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

  // ── Sync prefs from other windows ──────────────────────────────────────────

  api.onPrefsChanged((changed) => {
    if ('matchThreshold' in changed) {
      $('match-threshold').value = changed.matchThreshold;
      $('match-threshold-val').textContent = changed.matchThreshold + '%';
      if (faceDetector) faceDetector.SIMILARITY_THRESHOLD = changed.matchThreshold / 100;
    }
    if ('cameraLockDelay' in changed) {
      $('camera-lock-delay').value = changed.cameraLockDelay;
      $('camera-lock-delay-val').textContent = delayLabel(changed.cameraLockDelay);
    }
  });

  // ── Screen lock/unlock ────────────────────────────────────────────────────

  api.onScreenLocked(() => {
    wasRunningBeforeLock = cameraActive;
    if (cameraActive && faceDetector) {
      faceDetector.stop();
      cameraActive = false;
      noFaceAt = null;
      consecutiveMisses = 0;
      lastFaceRecognized = false;
      lastSimilarity = 0;
      stopTimerUpdate();
      updatePreviewUI();
      updateMonitoringBtn();
      const statusEl = $('detection-status-text');
      if (statusEl) { statusEl.textContent = 'Screen locked'; statusEl.className = 'detection-status-text'; }
    }
  });

  api.onScreenUnlocked(() => {
    if (wasRunningBeforeLock) {
      wasRunningBeforeLock = false;
      startCamera();
    }
  });

  // ── Init UI ───────────────────────────────────────────────────────────────

  $('camera-lock-delay').value = prefs.cameraLockDelay || 10;
  $('camera-lock-delay-val').textContent = delayLabel(prefs.cameraLockDelay || 10);
  $('camera-check-interval').value = prefs.cameraCheckInterval || 1;
  $('camera-check-interval-val').textContent = intervalLabel(prefs.cameraCheckInterval || 1);
  $('match-threshold').value = prefs.matchThreshold || 35;
  $('match-threshold-val').textContent = (prefs.matchThreshold || 35) + '%';

  $('start-on-login').checked = prefs.startOnLogin || false;
  $('menu-bar-only').checked = prefs.menuBarOnly !== false;
  $('notifications').checked = prefs.notifications !== false;

  updateMonitoringBtn();
  updatePreviewUI();

  const faceData = await api.faceGet();
  if (faceData && faceData.photo) {
    showEnrolledFace(faceData.photo);
  }

  await populateCameraList();

  const savedCamId = $('camera-select').value;
  if (savedCamId) {
    console.log('[UI] Saved camera found, auto-starting:', savedCamId);
    await startCamera();
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  $('camera-lock-delay').addEventListener('input', e => {
    $('camera-lock-delay-val').textContent = delayLabel(e.target.value);
    api.savePreferences({ cameraLockDelay: parseFloat(e.target.value) });
  });
  $('match-threshold').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    $('match-threshold-val').textContent = val + '%';
    api.savePreferences({ matchThreshold: val });
    if (faceDetector) faceDetector.SIMILARITY_THRESHOLD = val / 100;
  });
  $('camera-check-interval').addEventListener('input', e => {
    $('camera-check-interval-val').textContent = intervalLabel(e.target.value);
    if (faceDetector && faceDetector.detecting) {
      faceDetector.setCheckInterval(parseFloat(e.target.value) * 1000);
    }
  });

  $('camera-select').addEventListener('change', async () => {
    const camId = $('camera-select').value || '';
    console.log('[UI] Camera selected:', camId);
    api.savePreferences({ selectedCameraId: camId });
    prefs.selectedCameraId = camId;

    if (!camId) {
      stopCamera();
      return;
    }

    if (cameraActive && faceDetector) {
      faceDetector.stop();
      cameraActive = false;
    }
    await startCamera();
  });

  $('monitoring-toggle-btn').addEventListener('click', async () => {
    if (!monitoring) {
      if (!cameraActive) {
        const camId = $('camera-select').value;
        if (!camId) {
          alert('Please select a camera first');
          return;
        }
        await startCamera();
      }
      monitoring = true;
      await api.enableToggle();
    } else {
      monitoring = false;
      await api.enableToggle();
    }
    updateMonitoringBtn();
  });

  $('preview-toggle-btn').addEventListener('click', () => {
    previewOn = !previewOn;
    api.savePreferences({ showCameraPreview: previewOn });
    updatePreviewUI();
  });

  $('lock-now-btn').addEventListener('click', () => api.lockNow());

  $('enroll-btn').addEventListener('click', enrollFace);
  $('re-enroll-btn').addEventListener('click', async () => {
    $('enrolled-photo-container').style.display = 'none';
    $('enroll-prompt').style.display = '';
    await enrollFace();
  });

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
