'use strict';

const Store = require('electron-store');

const schema = {
  enabled:            { type: 'boolean', default: false },
  autoMonitor:        { type: 'boolean', default: false },
  startOnLogin:       { type: 'boolean', default: false },
  menuBarOnly:        { type: 'boolean', default: true },
  notifications:      { type: 'boolean', default: true },
  cameraCheckInterval:{ type: 'number',  default: 1 },
  matchThreshold:     { type: 'number',  default: 35 },
  cameraLockDelay:    { type: 'number',  default: 10 },
  showCameraPreview:  { type: 'boolean', default: false },
  selectedCameraId:   { type: 'string',  default: '' },
  faceDescriptor:     { type: ['array', 'null'],  default: null },
  facePhoto:          { type: ['string', 'null'], default: null },
};

module.exports = new Store({
  schema,
  // Note: face descriptor is biometric data stored locally.
  // macOS file permissions restrict access to the current user.
  // Encryption can be added for new installs via encryptionKey option,
  // but would require migration for existing users.
});
