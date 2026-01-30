Image generation script

This script creates 4 PNG images with the exact specifications you requested:

1. icon.png - 1024x1024, black background (#000000), white bold-looking sans-serif text "EZER" centered
2. adaptive-icon.png - 1024x1024, same as `icon.png`
3. splash.png - 1284x2778, black background, white text "EZER" centered
4. favicon.png - 48x48, black background, white text "EZER" centered

Notes:
- Uses `jimp` for pure-JS image generation.
- The script writes the images to the repository root (adjustable in `scripts/generate-icons.js`).
- Jimp provides built-in sans-serif fonts; they are not explicitly "bold" fonts, but are high-contrast and centered as requested.

Commands (run from repository root):

Install the dependency (pnpm workspace aware) and run the generator:

```bash
pnpm add -w jimp
node scripts/generate-icons.js
```

Or with npm:

```bash
npm install jimp
node scripts/generate-icons.js
```

After running, you'll find `icon.png`, `adaptive-icon.png`, `splash.png`, and `favicon.png` in the repository root.

If you want me to instead generate the PNGs directly here and commit them into the repo, tell me and I will attempt to add base64-encoded PNG files to the workspace (note: that may increase repo size).