'use strict';

const { app } = require('electron');

function applyDockMode({ menuBarOnly, showInDock }) {
  // Dock is macOS only
  if (process.platform !== 'darwin') return;

  if (showInDock || !menuBarOnly) {
    app.dock?.show();
  } else {
    app.dock?.hide();
  }
}

module.exports = { applyDockMode };
