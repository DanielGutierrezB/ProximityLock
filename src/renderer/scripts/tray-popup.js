'use strict';

(async function init() {
  const $ = id => document.getElementById(id);
  const api = window.proximityLock;
  const prefs = await api.getPreferences();

  let monitoring = prefs.enabled || false;

  // ── Camera selector ───────────────────────────────────────────────────────

  async function populatePopupCameras() {
    try {
      let tempStream = null;
      try { tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch (_) {}
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      if (tempStream) tempStream.getTracks().forEach(t => t.stop());
      const select = $('popup-camera-select');
      const savedId = prefs.selectedCameraId || '';
      select.innerHTML = '<option value="">Select a camera…</option>';
      cameras.forEach((cam, i) => {
        const opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${i + 1}`;
        if (cam.deviceId === savedId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) { console.error('[Popup] enumerate failed:', e.message); }
  }

  await populatePopupCameras();

  $('popup-camera-select').addEventListener('change', () => {
    const camId = $('popup-camera-select').value || '';
    api.savePreferences({ selectedCameraId: camId });
  });

  // ── Init sliders ──────────────────────────────────────────────────────────

  const matchEl = $('popup-match-threshold');
  const matchValEl = $('popup-match-val');
  const delayEl = $('popup-lock-delay');
  const delayValEl = $('popup-delay-val');
  const intervalEl = $('popup-check-interval');
  const intervalValEl = $('popup-interval-val');

  matchEl.value = prefs.matchThreshold || 35;
  matchValEl.textContent = (prefs.matchThreshold || 35) + '%';
  delayEl.value = prefs.cameraLockDelay || 10;
  delayValEl.textContent = (prefs.cameraLockDelay || 10) + 's';
  intervalEl.value = prefs.cameraCheckInterval || 1;
  intervalValEl.textContent = (prefs.cameraCheckInterval || 1) + 's';

  // ── Enrolled face ─────────────────────────────────────────────────────────

  const faceData = await api.faceGet();
  if (faceData && faceData.photo) {
    $('enrolled-photo').src = faceData.photo;
    $('enrolled-row').style.display = '';
    $('no-enroll-row').style.display = 'none';
  }

  // ── Monitoring button ─────────────────────────────────────────────────────

  function updateMonitoringBtn(faceInfo) {
    const btn = $('popup-monitoring-btn');
    const dot = $('status-dot');
    const text = $('status-text');
    if (!btn) return;
    if (!monitoring) {
      btn.textContent = '▶ Start Monitoring';
      btn.className = 'btn btn-block btn-success';
      if (dot) dot.className = 'status-dot grey';
      if (text) text.textContent = 'Idle';
      return;
    }
    if (faceInfo && faceInfo.matched) {
      btn.textContent = `🟢 Matched ${faceInfo.similarity || 0}%`;
      btn.className = 'btn btn-block btn-success';
    } else if (faceInfo && !faceInfo.matched) {
      btn.textContent = '🔴 No face detected';
      btn.className = 'btn btn-block btn-danger';
    } else {
      btn.textContent = '⏹ Stop Monitoring';
      btn.className = 'btn btn-block btn-secondary';
      if (dot) dot.className = 'status-dot grey';
      if (text) text.textContent = 'Monitoring…';
    }
  }

  updateMonitoringBtn(null);

  // ── Face status updates ───────────────────────────────────────────────────

  api.onFaceStatusUpdate(({ matched, similarity }) => {
    const dot = $('status-dot');
    const text = $('status-text');
    if (matched) {
      dot.className = 'status-dot green';
      text.textContent = `Face matched (${similarity || 0}%)`;
    } else {
      dot.className = 'status-dot red';
      text.textContent = 'No face detected';
    }
    updateMonitoringBtn({ matched, similarity });
  });

  // ── Event listeners ───────────────────────────────────────────────────────

  matchEl.addEventListener('input', e => {
    const val = parseInt(e.target.value);
    matchValEl.textContent = val + '%';
    api.savePreferences({ matchThreshold: val });
  });

  delayEl.addEventListener('input', e => {
    const val = parseInt(e.target.value);
    delayValEl.textContent = val + 's';
    api.savePreferences({ cameraLockDelay: val });
  });

  intervalEl.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    intervalValEl.textContent = val + 's';
    api.savePreferences({ cameraCheckInterval: val });
  });

  $('popup-monitoring-btn').addEventListener('click', async () => {
    await api.enableToggle();
    monitoring = !monitoring;
    updateMonitoringBtn(null);
  });

  $('popup-lock-btn').addEventListener('click', () => api.lockNow());

  $('popup-open-btn').addEventListener('click', () => api.openPrefs());

  $('popup-quit-btn').addEventListener('click', () => api.quit());

  $('retake-btn').addEventListener('click', () => {
    api.openPrefs();
  });

  // Sync full state when popup is shown (so it's never stale)
  api.onSyncState(({ enabled, status, lastFaceStatus }) => {
    monitoring = enabled;
    // Update status dot + text from the last known face status
    if (lastFaceStatus) {
      const dot = $('status-dot');
      const text = $('status-text');
      if (lastFaceStatus.matched) {
        dot.className = 'status-dot green';
        text.textContent = `Face matched (${lastFaceStatus.similarity || 0}%)`;
      } else {
        dot.className = 'status-dot red';
        text.textContent = 'No face detected';
      }
      updateMonitoringBtn(lastFaceStatus);
    } else if (!enabled) {
      const dot = $('status-dot');
      const text = $('status-text');
      dot.className = 'status-dot grey';
      text.textContent = 'Idle';
      updateMonitoringBtn(null);
    } else {
      updateMonitoringBtn(null);
    }
  });

  // Sync prefs from main window
  api.onPrefsChanged((changed) => {
    if ('matchThreshold' in changed) {
      matchEl.value = changed.matchThreshold;
      matchValEl.textContent = changed.matchThreshold + '%';
    }
    if ('cameraLockDelay' in changed) {
      delayEl.value = changed.cameraLockDelay;
      delayValEl.textContent = changed.cameraLockDelay + 's';
    }
    if ('cameraCheckInterval' in changed) {
      intervalEl.value = changed.cameraCheckInterval;
      intervalValEl.textContent = changed.cameraCheckInterval + 's';
    }
  });

})();
