'use strict';

const { exec } = require('child_process');
const { EventEmitter } = require('events');

class LockManager extends EventEmitter {
  lockNow() {
    if (process.platform === 'win32') {
      exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
        if (err) console.error('lock: Windows LockWorkStation failed:', err.message);
      });
    } else {
      exec('open -a ScreenSaverEngine', (err) => {
        if (err) {
          console.error('lock: ScreenSaverEngine failed:', err.message);
          exec('pmset displaysleepnow', (err2) => {
            if (err2) console.error('lock: pmset fallback failed:', err2.message);
          });
        }
      });
    }
    this.emit('locked');
  }
}

module.exports = new LockManager();
