<p align="center">
  <img src="assets/icons/icon.png" alt="ProximityLock" width="128" height="128">
</p>

<h1 align="center">ProximityLock</h1>

<p align="center">
  <strong>Lock your Mac automatically when you walk away.</strong><br>
  Face detection powered by AI — no cloud, no account, 100% local.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="macOS">
  <img src="https://img.shields.io/badge/arch-Apple%20Silicon-green" alt="Apple Silicon">
  <img src="https://img.shields.io/badge/version-1.0.0-orange" alt="Version">
</p>

---

## How it works

ProximityLock uses your Mac's camera and on-device face recognition to detect when you leave. If your face isn't detected for a configurable number of seconds, your screen locks automatically.

- **No cloud processing** — all face detection runs locally using [@vladmandic/human](https://github.com/vladmandic/human)
- **No account required** — your face descriptor stays on your machine
- **Low overhead** — pauses when screen is locked to save battery

## Features

- 📷 **Camera-based face detection** with real-time match percentage
- 🔒 **Auto-lock** when your face isn't detected (configurable delay: 1–30s)
- 🎯 **Match threshold** — adjust how strict face recognition is (20–80%)
- 👁 **Live preview** toggle (detection works with preview off)
- 📊 **Menu bar icon** with live match % or lock countdown
- 🖥 **Tray popup** — quick access to controls without opening the full app
- ⚙️ **Settings overlay** — check interval, start on login, notifications
- 🔋 **Battery-friendly** — pauses camera when screen locks
- 🚀 **Auto-start on launch** — optional, remembers your preference

## Screenshots

### Main Window
Two-column layout: camera preview on the left, controls on the right.

### Menu Bar
Green/red circle icon with match percentage or countdown timer.

### Tray Popup
Quick access mini panel anchored to the menu bar icon.

## Installation

### From DMG
1. Open `ProximityLock-1.0.0-arm64.dmg`
2. Drag ProximityLock to Applications
3. Right-click → Open (first time, since it's not signed)

### From source
```bash
git clone https://github.com/DanielGutierrezB/ProximityLock.git
cd ProximityLock
npm install
npm run dev        # Development
npm run build      # Build DMG
```

## Usage

1. **Select a camera** from the dropdown — detection starts immediately
2. **Enroll your face** by clicking "Take Photo"
3. Adjust **Match threshold** (lower = more lenient) and **Lock delay** (seconds before locking)
4. Click **▶ Start Monitoring** — your Mac will now lock when you walk away
5. The menu bar icon shows 🟢 (matched) or 🔴 (no face) with live percentage

## Tech Stack

- **Electron** — cross-platform desktop app
- **[@vladmandic/human](https://github.com/vladmandic/human)** — face detection & recognition (WebGPU accelerated)
- **electron-builder** — packaging & distribution
- **electron-store** — persistent preferences

## Requirements

- macOS 12+ (Apple Silicon)
- Camera access permission

## Privacy

- Face descriptors are stored locally in `~/Library/Application Support/proximitylock/`
- No data is sent to any server
- Camera is only active when the app is running and a camera is selected
- Camera pauses automatically when screen is locked

## License

Private — © Daniel Gutiérrez
