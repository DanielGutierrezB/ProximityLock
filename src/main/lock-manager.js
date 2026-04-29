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
    // Try CGSession first (most reliable on macOS), then fallback
    const cgSession = '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend';
    exec(cgSession, (err) => {
      if (err) {
        exec('pmset displaysleepnow');
      }
    });
    this.emit('locked');
  }

  get isLockPending() {
    return this.lockTimer !== null;
  }
}

module.exports = new LockManager();
