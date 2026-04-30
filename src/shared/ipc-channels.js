const IPC = {
  DEVICES_UPDATED: 'devices:updated',
  DEVICE_RSSI_UPDATE: 'device:rssi-update',
  STATUS_CHANGED: 'status:changed',

  GET_PREFERENCES: 'preferences:get',
  SAVE_PREFERENCES: 'preferences:save',
  GET_DEVICES: 'devices:get',
  START_SCAN: 'scan:start',
  STOP_SCAN: 'scan:stop',
  SELECT_DEVICE: 'device:select',
  LOCK_NOW: 'lock:now',
  ENABLE_TOGGLE: 'enable:toggle',
  SAVE_DEVICE: 'device:save',
  FACE_ENROLL: 'face:enroll',
  FACE_GET: 'face:get',
  REMOVE_DEVICE: 'device:remove',
};

module.exports = { IPC };
