'use strict';

(async function init() {
  const $ = id => document.getElementById(id);
  const api = window.proximityLock;
  const prefs = await api.getPreferences();

  let monitoring = prefs.enabled || false;

  // ── Init sliders ──────────────────────────────────────────────────────────

  const matchEl = $('popup-match-threshold');
  const matchValEl = $('popup-match-val');
  const delayEl = $('popup-lock-delay');
  const delayValEl = $('popup-delay-val');

  matchEl.value = prefs.matchThreshold || 35;
  matchValEl.textContent = (prefs.matchThreshold || 35) + '%';
  delayEl.value = prefs.cameraLockDelay || 10;
  delayValEl.textContent = (prefs.cameraLockDelay || 10) + 's';

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
    if (!btn) return;
    if (!monitoring) {
      btn.textContent = '▶ Start Monitoring';
      btn.className = 'btn btn-block btn-success';
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
  });

})();
