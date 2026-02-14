# Running the EZER Mobile App

## Quick Start (from repo root)

```bash
pnpm mobile
```

This starts Expo in **LAN mode** (recommended for most setups).

**Windows (use D: for temp to avoid C: full):** from repo root run:
```powershell
.\run-with-d-temp.ps1 pnpm mobile
```
For web: `.\run-with-d-temp.ps1 pnpm mobile:web` or use `.\apps\mobile\run-web.ps1`.

## Alternative: Tunnel Mode

If LAN mode doesn't work (firewall issues, different networks):

```bash
pnpm mobile:tunnel
```

## Phone Setup

1. Install **Expo Go** from App Store (iOS) or Play Store (Android)
2. Ensure phone and computer are on **same WiFi network** (LAN mode only)
3. Scan the QR code shown in terminal
4. App loads on your phone

## Common Issues

### "expo: command not found" or "Cannot find module 'expo'"

**Cause**: Running from wrong directory or dependencies not installed.

**Fix**:
```bash
# From repo root:
pnpm install
pnpm mobile
```

### QR code doesn't connect (LAN mode)

**Cause**: Firewall blocking, or phone on different network.

**Fix**: Use tunnel mode instead:
```bash
pnpm mobile:tunnel
```

### "Port 8081 already in use"

**Cause**: Previous Expo process still running.

**Fix** (Windows):
```bash
taskkill /F /IM node.exe
```

**Fix** (Mac/Linux):
```bash
npx kill-port 8081
```

### Windows: "ENOENT node:sea" error

**Cause**: Expo CLI bug with Windows paths containing colons.

**Fix**: Already patched in this repo. If it recurs after `pnpm install`:
- Delete `apps/mobile/.expo` folder
- Run `pnpm mobile` again

## Do NOT Run Expo From Repo Root Directly

This will fail:
```bash
# WRONG - from repo root
npx expo start
```

Always use the workspace script:
```bash
# CORRECT - from repo root
pnpm mobile
```

Or navigate to the app directory first:
```bash
# CORRECT - from app directory
cd apps/mobile
npx expo start --lan
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm mobile` | Start Expo (LAN mode) |
| `pnpm mobile:tunnel` | Start Expo (tunnel mode) |
| `pnpm dev:mobile` | Alias for `pnpm mobile` |

## App Location

The Expo app is located at: `apps/mobile`
