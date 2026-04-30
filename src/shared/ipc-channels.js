'use strict';

module.exports = {
  IPC: {
    GET_PREFERENCES:   'prefs:get',
    SAVE_PREFERENCES:  'prefs:save',
    LOCK_NOW:          'lock:now',
    ENABLE_TOGGLE:     'enable:toggle',
    FACE_ENROLL:       'face:enroll',
    FACE_GET:          'face:get',
    FACE_STATUS:       'face:status',
    SCREEN_LOCKED:     'system:screen-locked',
    SCREEN_UNLOCKED:   'system:screen-unlocked',
    POPUP_FACE_STATUS: 'popup:face-status',
    OPEN_PREFS:        'app:open-prefs',
    QUIT:              'app:quit',
  },
};
