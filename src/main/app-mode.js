'use strict';

const { app } = require('electron');

function applyDockMode({ menuBarOnly, showInDock }) {
  if (showInDock || !menuBarOnly) {
    app.dock?.show();
  } else {
    app.dock?.hide();
  }
}

module.exports = { applyDockMode };
