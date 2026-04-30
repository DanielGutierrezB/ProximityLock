'use strict';

class FaceDetector {
  constructor() {
    this.video      = null;
    this.human      = null;
    this.detecting  = false;
    this.intervalId = null;
    this.onFaceStatus = null; // callback({detected, count, confidence})
    this.initialized  = false;
    this._busy        = false;
  }

  async init(videoElement) {
    this.video = videoElement;

    if (!window.electronPaths || !window.electronPaths.humanJsPath) {
      throw new Error('electronPaths bridge not available — check preload.js');
    }

    // Load the human.js browser bundle (UMD IIFE → sets window.Human)
    if (!window.Human) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = window.electronPaths.humanJsPath;
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Failed to load human.js from ' + s.src));
        document.head.appendChild(s);
      });
    }

    const HumanClass = window.Human && (window.Human.default || window.Human.Human);
    if (!HumanClass) throw new Error('Human class not found after loading human.js');

    const config = {
      modelBasePath: window.electronPaths.humanModelsUrl,
      debug:    false,
      async:    true,
      warmup:   'none',
      cacheSensitivity: 0,
      face: {
        enabled:  true,
        detector: { maxDetected: 1, rotation: false, skipFrames: 0, skipTime: 0, minConfidence: 0.4 },
        mesh:        { enabled: false },
        iris:        { enabled: false },
        description: { enabled: false },
        emotion:     { enabled: false },
        antispoof:   { enabled: false },
        liveness:    { enabled: false },
      },
      body:        { enabled: false },
      hand:        { enabled: false },
      gesture:     { enabled: false },
      object:      { enabled: false },
      segmentation:{ enabled: false },
    };

    this.human = new HumanClass(config);
    await this.human.load();
    this.initialized = true;
  }

  async start(checkIntervalMs) {
    if (!checkIntervalMs) checkIntervalMs = 1000;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise(resolve => { this.video.onloadedmetadata = resolve; });
    await this.video.play();

    this.detecting  = true;
    this.intervalId = setInterval(() => this._detect(), checkIntervalMs);
    setTimeout(() => this._detect(), 300);
  }

  stop() {
    this.detecting = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
  }

  setCheckInterval(ms) {
    if (!this.detecting) return;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this._detect(), ms);
  }

  async _detect() {
    if (!this.detecting || !this.video || this.video.readyState < 2 || this._busy) return;
    this._busy = true;
    try {
      const result     = await this.human.detect(this.video);
      const detected   = !!(result.face && result.face.length > 0);
      const count      = result.face ? result.face.length : 0;
      const confidence = detected ? (result.face[0].score || 0) : 0;
      if (this.onFaceStatus) this.onFaceStatus({ detected, count, confidence });
    } catch (err) {
      console.error('[FaceDetector]', err.message);
    } finally {
      this._busy = false;
    }
  }
}
