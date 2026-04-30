'use strict';

class FaceDetector {
  constructor() {
    this.video        = null;
    this.human        = null;
    this.detecting    = false;
    this.intervalId   = null;
    this.onFaceStatus = null; // callback({detected, recognized, count, confidence, similarity})
    this.initialized  = false;
    this._busy        = false;
    this._enrolledDescriptor = null; // Float32Array from enrollment photo
    this.SIMILARITY_THRESHOLD = 0.5; // 0-1, higher = stricter match
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
        detector: { maxDetected: 3, rotation: false, skipFrames: 0, skipTime: 0, minConfidence: 0.4 },
        mesh:        { enabled: true },   // needed for description
        iris:        { enabled: false },
        description: { enabled: true },   // face embeddings for recognition
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
    console.log('[FaceDetector] Initialized with face recognition');
  }

  /** Start camera and begin periodic detection */
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

  /** Enroll: capture face descriptor from current video frame */
  async enroll() {
    if (!this.video || this.video.readyState < 2) {
      throw new Error('Camera not ready');
    }
    const result = await this.human.detect(this.video);
    if (!result.face || result.face.length === 0) {
      throw new Error('No face detected — look at the camera');
    }
    if (result.face.length > 1) {
      throw new Error('Multiple faces detected — only you should be in frame');
    }
    const face = result.face[0];
    if (!face.embedding || face.embedding.length === 0) {
      throw new Error('Could not compute face descriptor — try again');
    }
    this._enrolledDescriptor = new Float32Array(face.embedding);
    console.log('[FaceDetector] Enrolled! Descriptor length:', this._enrolledDescriptor.length);

    // Capture snapshot for UI
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext('2d').drawImage(this.video, 0, 0);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    return {
      descriptor: Array.from(this._enrolledDescriptor),
      photo: photoDataUrl,
      confidence: face.score,
    };
  }

  /** Load a previously saved descriptor */
  loadDescriptor(descriptorArray) {
    if (descriptorArray && descriptorArray.length > 0) {
      this._enrolledDescriptor = new Float32Array(descriptorArray);
      console.log('[FaceDetector] Loaded saved descriptor, length:', this._enrolledDescriptor.length);
    }
  }

  /** Compute cosine similarity between two descriptor vectors */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot  += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  async _detect() {
    if (!this.detecting || !this.video || this.video.readyState < 2 || this._busy) return;
    this._busy = true;
    try {
      const result   = await this.human.detect(this.video);
      const faces    = result.face || [];
      const detected = faces.length > 0;
      let recognized = false;
      let similarity = 0;
      let confidence = 0;

      if (detected && this._enrolledDescriptor) {
        // Check each detected face against enrolled descriptor
        for (const face of faces) {
          if (face.embedding && face.embedding.length > 0) {
            const sim = this._cosineSimilarity(this._enrolledDescriptor, face.embedding);
            if (sim > similarity) {
              similarity = sim;
              confidence = face.score || 0;
            }
            if (sim >= this.SIMILARITY_THRESHOLD) {
              recognized = true;
              break;
            }
          }
        }
      } else if (detected && !this._enrolledDescriptor) {
        // No enrollment yet — treat any face as recognized
        recognized = true;
        confidence = faces[0].score || 0;
      }

      if (this.onFaceStatus) {
        this.onFaceStatus({
          detected,
          recognized,
          count: faces.length,
          confidence,
          similarity: Math.round(similarity * 100),
        });
      }
    } catch (err) {
      console.error('[FaceDetector]', err.message);
    } finally {
      this._busy = false;
    }
  }
}
