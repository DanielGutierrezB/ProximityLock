# ProximityLock — Face Detection Screen Lock

## Overview
A cross-platform (macOS + Windows) menu bar app built with Electron that uses your computer's camera to detect your face. When you walk away and your face is no longer detected, it automatically locks your screen. Everything runs 100% locally — no cloud, no account.

## Core Features

### 1. Face Detection & Recognition
- Real-time face detection using [@vladmandic/human](https://github.com/vladmandic/human) (WebGPU/WebGL)
- Face enrollment: user captures a reference photo
- Cosine similarity matching against enrolled face descriptor
- Configurable match threshold (20–80%)
- Configurable check interval (0.5–3s)
- Consecutive miss threshold before triggering lock countdown

### 2. Automatic Screen Locking
- Configurable delay before locking (1–30 seconds)
- Lock cooldown to prevent rapid re-locks (15s)
- **macOS:** ScreenSaverEngine with pmset fallback
- **Windows:** `rundll32 user32.dll,LockWorkStation`
- Camera pauses when screen is locked, resumes on unlock

### 3. Menu Bar / System Tray
- Colored dot icon showing status:
  - 🟢 Face matched (green)
  - 🔴 No face detected (red)
  - ⚫ Disabled / idle (grey)
- Live match percentage or countdown displayed next to icon (macOS)
- Click to open mini popup with full controls

### 4. Mini Popup (Tray View)
- Current status indicator (matched/not matched)
- Camera selector dropdown
- Enrolled face preview with retake option
- Match threshold slider
- Lock delay slider
- Check interval slider
- Start/Stop monitoring button
- Lock Now button
- Open App / Quit buttons

### 5. Main Window (Preferences)
- Camera preview with toggle (detection works even with preview off)
- Camera selector
- Face enrollment (take photo / retake)
- Match threshold, lock delay, and check interval sliders
- Start/Stop monitoring with live status
- Auto-start on launch toggle
- Settings overlay: Start on Login, Menu Bar Only, Notifications

### 6. Window Synchronization
- All settings sync between main window and tray popup in real time
- Main window hides on close (renderer stays alive for camera/detection)
- Tray popup syncs full state every time it opens
- Monitoring can be toggled from either window

## Architecture

```
src/
├── main/
│   ├── main.js              # Electron main process, IPC handlers, app lifecycle
│   ├── tray.js              # TrayManager: icon, popup window, state sync
│   ├── lock-manager.js      # Screen lock (macOS + Windows)
│   ├── preferences-store.js # electron-store with schema
│   ├── preload.js           # Context bridge (imports shared IPC channels)
│   ├── auto-launch.js       # Start on login via auto-launch package
│   └── app-mode.js          # Dock visibility (macOS)
├── renderer/
│   ├── index.html           # Main window
│   ├── tray-popup.html      # Tray popup
│   ├── scripts/
│   │   ├── face-detector.js # FaceDetector class (Human.js wrapper)
│   │   ├── preferences.js   # Main window logic
│   │   └── tray-popup.js    # Tray popup logic
│   └── styles/
│       ├── main.css
│       └── tray-popup.css
├── shared/
│   └── ipc-channels.js      # Single source of truth for IPC channel names
└── assets/
    └── icons/
```

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `prefs:get` | renderer → main | Get all preferences |
| `prefs:save` | renderer → main | Save preferences (allowlisted keys) |
| `prefs:changed` | main → renderer | Broadcast preference changes to all windows |
| `lock:now` | renderer → main | Trigger immediate screen lock |
| `enable:toggle` | renderer → main | Toggle monitoring on/off |
| `enable:set` | renderer → main | Set monitoring to specific state |
| `face:enroll` | renderer → main | Save face descriptor + photo |
| `face:get` | renderer → main | Get saved face data |
| `face:status` | renderer → main | Report face match status (used by tray) |
| `monitoring:changed` | main → renderer | Notify renderer of monitoring state change |
| `popup:face-status` | main → popup | Forward face status to popup |
| `popup:sync-state` | main → popup | Push full state snapshot to popup |
| `system:screen-locked` | main → renderer | Screen was locked (pause camera) |
| `system:screen-unlocked` | main → renderer | Screen was unlocked (resume camera) |

## Security

- **No network access** — all processing is local
- **Face descriptors** stored in app data directory with OS file permissions
- **CSP** restricts script/style sources (unsafe-eval required for Human.js WebAssembly)
- **Context isolation** enabled, `nodeIntegration` disabled
- **Sandbox disabled** only because preload uses `require()` for path resolution
- **No Bluetooth permissions** — camera only
- **IPC allowlist** — only specific preference keys can be written

## Tech Stack

- **Electron** 29.x — desktop framework
- **@vladmandic/human** 3.x — face detection & recognition (WebGPU/WebGL, no cloud)
- **electron-store** 7.x — persistent preferences with schema validation
- **auto-launch** 5.x — start on login
- **electron-builder** 24.x — packaging (DMG + NSIS)

## Build

```bash
npm install
npm run dev              # Development
npm run build            # Build macOS DMG (arm64)
npx electron-builder --win  # Build Windows installer (x64)
```

## Platforms

| Platform | Architecture | Installer | Lock Method |
|----------|-------------|-----------|-------------|
| macOS | arm64 (Apple Silicon) | DMG | ScreenSaverEngine / pmset |
| Windows | x64 | NSIS (.exe) | rundll32 LockWorkStation |
