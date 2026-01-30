// scripts/generate-icons.js
// Generates 4 PNG images per user's exact specs using Jimp.
// Run: `pnpm add -w jimp` (or `npm i jimp`) then `node scripts/generate-icons.js`

const JimpModule = require('jimp');
const Jimp = JimpModule.default || JimpModule;
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..'); // write to repo root
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const specs = [
  { name: 'icon.png', w: 1024, h: 1024 },
  { name: 'adaptive-icon.png', w: 1024, h: 1024 },
  { name: 'splash.png', w: 1284, h: 2778 },
  { name: 'favicon.png', w: 48, h: 48 },
];

function chooseFontForHeight(h) {
  // Use the largest available built-in Jimp font appropriate for the image.
  // Available: 8,16,32,64,128,256
  if (Math.min(h, 1024) >= 1024) return Jimp.FONT_SANS_128_WHITE;
  if (Math.min(h, 512) >= 512) return Jimp.FONT_SANS_64_WHITE;
  if (Math.min(h, 256) >= 256) return Jimp.FONT_SANS_64_WHITE;
  if (Math.min(h, 64) >= 64) return Jimp.FONT_SANS_32_WHITE;
  return Jimp.FONT_SANS_16_WHITE;
}

async function generate() {
  for (const s of specs) {
    console.log(`Generating ${s.name} (${s.w}x${s.h})`);
    // Create new image using the Jimp constructor
    const image = new Jimp(s.w, s.h, 0x000000FF); // solid black, no transparency

    const fontConst = chooseFontForHeight(Math.max(s.w, s.h));
    const font = await Jimp.loadFont(fontConst);

    const text = 'EZER';

    // Measure text and scale if necessary to be large and bold-like
    let textWidth = Jimp.measureText(font, text);
    let textHeight = Jimp.measureTextHeight(font, text, s.w);

    // If the text is too small relative to image, try to increase scale by printing to a temporary image
    // We'll compute a scale factor to occupy a reasonable portion of the width (about 60%)
    const targetRatio = 0.6; // target text width as fraction of image width
    const scale = Math.min(1, (s.w * targetRatio) / Math.max(1, textWidth));

    // If scale < 1, we'll print normally and it will be centered (smaller text). For large images, font constant chosen will be big enough.

    // Center coords
    textWidth = Jimp.measureText(font, text);
    textHeight = Jimp.measureTextHeight(font, text, s.w);
    const x = Math.floor((s.w - textWidth) / 2);
    const y = Math.floor((s.h - textHeight) / 2);

    image.print(font, x, y, {
      text,
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    }, textWidth, textHeight);

    // Ensure PNG (no transparency)
    const outPath = path.join(outDir, s.name);
    await image.background(0x000000FF).writeAsync(outPath);
    console.log(`Wrote ${outPath}`);
  }
  console.log('Done.');
}

generate().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
