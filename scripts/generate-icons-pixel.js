// scripts/generate-icons-pixel.js
// Generate simple PNGs with block-style 'EZER' text using pngjs.
// This avoids native font rendering issues by drawing glyphs as pixel blocks.

const fs = require('fs');
const { PNG } = require('pngjs');

const outDir = __dirname + '/..';

const specs = [
  { name: 'icon.png', w: 1024, h: 1024 },
  { name: 'adaptive-icon.png', w: 1024, h: 1024 },
  { name: 'splash.png', w: 1284, h: 2778 },
  { name: 'favicon.png', w: 48, h: 48 },
];

// Simple 7x7 pixel block font for needed letters: E, Z, R
const FONT = {
  E: [
    '1111111',
    '1000000',
    '1000000',
    '1111110',
    '1000000',
    '1000000',
    '1111111',
  ],
  Z: [
    '1111111',
    '0000011',
    '0000110',
    '0001100',
    '0011000',
    '0110000',
    '1111111',
  ],
  R: [
    '1111100',
    '1000010',
    '1000010',
    '1111100',
    '1010000',
    '1001000',
    '1000100',
  ],
};

function drawText(png, text, scale) {
  // prepare glyph widths
  const glyphW = FONT.E[0].length; // 7
  const glyphH = FONT.E.length; // 7
  const letterSpacing = Math.max(1, Math.floor(scale));

  const textWidth = text.length * glyphW * scale + (text.length - 1) * letterSpacing;
  const textHeight = glyphH * scale;

  const startX = Math.floor((png.width - textWidth) / 2);
  const startY = Math.floor((png.height - textHeight) / 2);

  // white color
  const white = { r: 255, g: 255, b: 255, a: 255 };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = FONT[ch];
    if (!glyph) continue;
    const gx = startX + i * (glyphW * scale + letterSpacing);
    for (let y = 0; y < glyphH; y++) {
      for (let x = 0; x < glyphW; x++) {
        if (glyph[y][x] === '1') {
          // draw scaled block
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = gx + x * scale + sx;
              const py = startY + y * scale + sy;
              if (px >= 0 && px < png.width && py >= 0 && py < png.height) {
                const idx = (py * png.width + px) << 2;
                png.data[idx] = white.r;
                png.data[idx + 1] = white.g;
                png.data[idx + 2] = white.b;
                png.data[idx + 3] = white.a;
              }
            }
          }
        }
      }
    }
  }
}

(async function generate() {
  for (const s of specs) {
    console.log(`Creating ${s.name} ${s.w}x${s.h}`);
    const png = new PNG({ width: s.w, height: s.h });
    // fill black
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const idx = (y * s.w + x) << 2;
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }

    // choose scale so text fills a reasonable portion
    // target width ratio
    const targetRatio = 0.6;
    const glyphW = 7;
    const approximateScale = Math.floor((s.w * targetRatio) / (4 * glyphW));
    const scale = Math.max(1, approximateScale);

    drawText(png, 'EZER', scale);

    const outPath = outDir + '/' + s.name;
    const buffer = PNG.sync.write(png);
    fs.writeFileSync(outPath, buffer);
    console.log('Wrote', outPath);
  }
  console.log('All images generated.');
})();
