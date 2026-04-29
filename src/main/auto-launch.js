'use strict';

const AutoLaunch = require('auto-launch');

const autoLauncher = new AutoLaunch({
  name: 'ProximityLock',
  isHidden: true,
});

async function setAutoLaunch(enabled) {
  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (enabled && !isEnabled) await autoLauncher.enable();
    else if (!enabled && isEnabled) await autoLauncher.disable();
  } catch (err) {
    console.error('auto-launch error:', err.message);
  }
}

async function getAutoLaunchStatus() {
  try {
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

module.exports = { setAutoLaunch, getAutoLaunchStatus };
