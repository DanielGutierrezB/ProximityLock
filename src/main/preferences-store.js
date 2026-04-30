'use strict';

const Store = require('electron-store');

const schema = {
  enabled:            { type: 'boolean', default: false },
  startOnLogin:       { type: 'boolean', default: false },
  menuBarOnly:        { type: 'boolean', default: true },
  showInDock:         { type: 'boolean', default: false },
  startMinimized:     { type: 'boolean', default: true },
  notifications:      { type: 'boolean', default: true },
  cameraCheckInterval:{ type: 'number',  default: 1 },
  matchThreshold:     { type: 'number',  default: 35 },
  cameraLockDelay:    { type: 'number',  default: 10 },
  showCameraPreview:  { type: 'boolean', default: false },
  selectedCameraId:   { type: 'string',  default: '' },
  faceDescriptor:     { type: ['array', 'null'],  default: null },
  facePhoto:          { type: ['string', 'null'], default: null },
};

module.exports = new Store({ schema });
