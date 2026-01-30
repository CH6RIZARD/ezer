# EAS Build Guide for EZER Mobile App

## Overview

This guide explains how to build and run the EZER mobile app using EAS (Expo Application Services) development builds. This is required because our monorepo setup needs custom native modules.

## Prerequisites

- Expo account (free): https://expo.dev/signup
- iPhone or Android device for testing
- Node.js installed on Windows

## One-Time Setup

### Step 1: Install EAS CLI

```powershell
npm install -g eas-cli
```

### Step 2: Login to Expo

```powershell
cd C:\Users\chiagozie\ezer\apps\mobile
eas login
```

Enter your Expo credentials when prompted.

### Step 3: Configure Project

```powershell
eas build:configure
```

This will:
- Create/update your `eas.json`
- Link your project to your Expo account
- Generate a project ID

### Step 4: Register Your Device (iOS only)

For iOS, you need to register your iPhone:

```powershell
eas device:create
```

Follow the prompts to:
1. Scan a QR code with your iPhone
2. Install the profile on your device
3. Trust the developer profile in Settings

## Building the App

### iOS Development Build

```powershell
cd C:\Users\chiagozie\ezer\apps\mobile
eas build --profile development --platform ios
```

This will:
- Build your app in the cloud (takes ~15-20 minutes first time)
- Send you an email/notification when done
- Provide a QR code to install on your registered device

### Android Development Build

```powershell
eas build --profile development --platform android
```

## Installing the Build

### iOS
1. After build completes, scan the QR code from the EAS dashboard
2. Or open the link on your iPhone
3. Install the app when prompted
4. Go to Settings → General → VPN & Device Management
5. Trust the developer certificate

### Android
1. After build completes, download the APK
2. Install on your device (enable "Install from unknown sources" if needed)

## Daily Development Workflow

### Starting the Dev Server

After you have the development build installed, you only need to run the dev server:

```powershell
cd C:\Users\chiagozie\ezer
pnpm mobile
```

This starts the Metro bundler. Your phone will automatically connect to it.

### Making Code Changes

1. Edit your code in VS Code
2. Save the file
3. The app on your phone updates automatically (hot reload)
4. No rebuild needed!

### When to Rebuild

You only need to rebuild when:
- Adding/removing native packages (e.g., new Expo modules)
- Changing `app.json` configuration
- Updating Expo SDK version
- Modifying native code

For JavaScript/TypeScript changes, just save the file - hot reload handles it.

## Tunnel Mode (Remote Development)

If your phone isn't on the same network:

```powershell
cd C:\Users\chiagozie\ezer
pnpm mobile:tunnel
```

This creates a public URL your phone can connect to from anywhere.

## Troubleshooting

### "Could not connect to development server"

1. Ensure phone and computer are on same WiFi
2. Try tunnel mode: `pnpm mobile:tunnel`
3. Check Windows Firewall isn't blocking port 8081

### "Build failed"

1. Check the build logs on expo.dev
2. Ensure all dependencies are compatible with your Expo SDK
3. Try `eas build --clear-cache --profile development --platform ios`

### Metro bundler won't start

```powershell
# Kill existing processes
taskkill /F /IM node.exe

# Clear cache
cd C:\Users\chiagozie\ezer\apps\mobile
rm -rf .expo node_modules/.cache

# Restart
cd C:\Users\chiagozie\ezer
pnpm mobile
```

## Project Structure

```
C:\Users\chiagozie\ezer\
├── apps/
│   └── mobile/           ← Expo app
│       ├── app.json      ← Expo config
│       ├── eas.json      ← EAS build config
│       ├── metro.config.js
│       └── package.json
├── packages/
│   ├── shared/           ← Shared utilities
│   └── ui/               ← UI components
└── package.json          ← Root scripts
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm mobile` | Start dev server (LAN mode) |
| `pnpm mobile:tunnel` | Start dev server (tunnel mode) |
| `eas build --profile development --platform ios` | Build iOS dev app |
| `eas build --profile development --platform android` | Build Android dev app |
| `eas device:create` | Register new iOS device |
| `eas whoami` | Check logged in account |
| `eas build:list` | See your builds |
