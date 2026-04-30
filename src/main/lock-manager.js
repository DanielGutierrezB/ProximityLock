'use strict';

const { exec } = require('child_process');
const { EventEmitter } = require('events');

class LockManager extends EventEmitter {
  constructor() {
    super();
    this.lockTimer = null;
  }

  scheduleLock(delaySec) {
    if (this.lockTimer) return; // already scheduled
    this.lockTimer = setTimeout(() => {
      this.lockTimer = null;
      this.lockNow();
    }, delaySec * 1000);
    this.emit('lockScheduled', delaySec);
  }

  cancelLock() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
      this.emit('lockCancelled');
    }
  }

  lockNow() {
    // Modern macOS: launch ScreenSaverEngine (locks if password-on-wake is enabled)
    // Then fallback to pmset displaysleepnow
    exec('open -a ScreenSaverEngine', (err) => {
      if (err) {
        console.error('lock: ScreenSaverEngine failed:', err.message);
        exec('pmset displaysleepnow', (err2) => {
          if (err2) console.error('lock: pmset fallback failed:', err2.message);
        });
      }
    });
    this.emit('locked');
  }

  get isLockPending() {
    return this.lockTimer !== null;
  }
}

module.exports = new LockManager();
