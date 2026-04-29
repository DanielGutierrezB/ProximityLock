# ProximityLock — Bluetooth Proximity Lock for macOS

## Overview
A macOS menu bar app (Electron) that monitors Bluetooth device proximity (Apple Watch, iPhone, or any BLE device) and automatically locks the computer when the device moves beyond a configurable distance threshold.

## Core Features

### 1. Bluetooth Device Scanning
- Scan and list all nearby Bluetooth/BLE devices
- Show device name, type, and signal strength (RSSI)
- Allow user to select which device to use as "key"
- Support Apple Watch, iPhone, or any BLE device
- Real-time RSSI monitoring with visual indicator

### 2. Proximity-Based Locking
- Configurable RSSI threshold for lock trigger (with a slider or numeric input)
- Configurable delay before locking (e.g., "lock after 10 seconds below threshold")
- Lock the Mac using: `pmset displaysleepnow` or CGSession suspend
- Optional: auto-unlock when device returns to range (with security warning)
- Grace period: brief dips in signal shouldn't trigger false locks

### 3. Menu Bar App
- **Menu bar icon** showing connection status:
  - 🟢 Device in range
  - 🟡 Device at edge of range
  - 🔴 Device out of range / disconnected
- Clicking icon shows dropdown with:
  - Current device & signal strength
  - Quick enable/disable toggle
  - "Lock Now" button
  - "Preferences..." option
  - "Quit" option

### 4. Preferences Window
- **Device Selection:** dropdown/list of scanned devices with refresh button
- **Sensitivity:** RSSI threshold slider (-40 to -100 dBm) with labels ("Very Close" to "Far")
- **Lock Delay:** seconds before lock triggers (5-60s slider)
- **App Behavior:**
  - ☑ Start on Login
  - ☑ Menu Bar Only (hide dock icon)
  - ☑ Show in Dock
  - ☑ Start Minimized
- **Notifications:** toggle for lock/unlock notifications
- **About:** version info

## Technical Requirements

### Architecture
- **Electron** with proper main/renderer process separation
- **NO god files** — each module/component in its own file
- Modular architecture:
  ```
  src/
  ├── main/
  │   ├── main.js                 # Electron main entry
  │   ├── tray.js                 # Menu bar/tray management
  │   ├── bluetooth.js            # BLE scanning & RSSI monitoring
  │   ├── lock-manager.js         # Screen lock logic
  │   ├── preferences-store.js    # Settings persistence
  │   ├── auto-launch.js          # Start on login
  │   └── app-mode.js             # Dock/menu-bar mode switching
  ├── renderer/
  │   ├── index.html              # Preferences window
  │   ├── styles/
  │   │   └── main.css            # Styles
  │   └── scripts/
  │       ├── preferences.js      # Preferences UI logic
  │       ├── device-list.js      # Device scanning UI
  │       └── signal-meter.js     # RSSI visual indicator
  ├── shared/
  │   ├── constants.js            # App constants
  │   └── ipc-channels.js         # IPC channel names
  └── assets/
      └── icons/                  # Tray icons (Template images for macOS)
  ```

### Bluetooth
- Use `@anthropic-ai/noble` or `noble` (BLE library for Node.js)
- If noble doesn't work well on modern macOS, consider `@electron/noble` or `node-bluetooth-hci-socket`
- Alternative: use native macOS `bleno`/CoreBluetooth via a native addon or `swift-bridge`
- RSSI polling interval: configurable, default every 3 seconds

### Build & Distribution
- **electron-builder** for packaging
- Target: **DMG installer** for macOS
- Architecture: **arm64** (Apple Silicon optimized)
- Also support universal build if easy
- App signing: skip for now (unsigned, for personal use)
- App name: "ProximityLock"
- Bundle ID: `com.danielgutierrez.proximitylock`

### macOS Integration
- Use `electron-store` for preferences persistence
- Use `auto-launch` npm package for login items
- Proper menu bar (Tray) with Template icons for dark/light mode
- Use `app.dock.hide()` / `app.dock.show()` for dock visibility
- Lock command: `osascript -e 'tell application "System Events" to keystroke "q" using {command down, control down}'` or `pmset displaysleepnow`

### UI Design
- Clean, native-looking macOS UI
- Use system fonts
- Dark mode support (follow system)
- Minimal, efficient — not cluttered
- Signal strength shown as a visual bar/meter

## Quality Requirements
- Code review each component
- No god files — keep files focused and small
- Proper error handling for Bluetooth permissions
- Handle case where Bluetooth is disabled
- Handle case where device disconnects unexpectedly
- Graceful degradation — never crash, always show status

## Build Commands
```bash
npm run dev          # Development mode with hot reload
npm run build        # Build the app
npm run dist         # Create DMG installer
npm run dist:arm64   # Create DMG for Apple Silicon specifically
```

## Permissions
The app will need:
- Bluetooth permission (macOS will prompt)
- Accessibility permission may be needed for screen lock
- Add to Info.plist: NSBluetoothAlwaysUsageDescription
