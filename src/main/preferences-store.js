'use strict';

const Store = require('electron-store');
const { DEFAULT_RSSI_THRESHOLD, DEFAULT_LOCK_DELAY_SEC } = require('../shared/constants');

const schema = {
  selectedDeviceId:   { type: 'string',  default: '' },
  selectedDeviceName: { type: 'string',  default: '' },
  rssiThreshold:      { type: 'number',  default: DEFAULT_RSSI_THRESHOLD },
  lockDelaySec:       { type: 'number',  default: DEFAULT_LOCK_DELAY_SEC },
  enabled:            { type: 'boolean', default: true },
  startOnLogin:       { type: 'boolean', default: false },
  menuBarOnly:        { type: 'boolean', default: true },
  showInDock:         { type: 'boolean', default: false },
  startMinimized:     { type: 'boolean', default: true },
  notifications:      { type: 'boolean', default: true },
  savedDevices:       { type: 'array',   default: [] },
  lockMode:           { type: 'string',  default: 'bluetooth' },
  cameraCheckInterval:{ type: 'number',  default: 1 },
  cameraLockDelay:    { type: 'number',  default: 5 },
  showCameraPreview:  { type: 'boolean', default: true },
  faceDescriptor:     { type: ['array', 'null'],  default: null },
  facePhoto:          { type: ['string', 'null'], default: null },
};

module.exports = new Store({ schema });
