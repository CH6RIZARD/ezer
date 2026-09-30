// Colour helpers shared by the wallet card and the card-art resolver.
// (Moved out of app/(tabs)/wallet.tsx so both use one implementation.)

import type { CardArtFallback } from './types';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True when `value` is a 3- or 6-digit hex colour, with or without `#`. */
export function isHexColor(value: string | undefined | null): value is string {
  return !!value && HEX.test(value.trim());
}

/** Normalises to `#rrggbb`. Callers must check isHexColor first. */
export function normalizeHex(hex: string): string {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return `#${full.toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const full = normalizeHex(hex).slice(1);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const d = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[d(r), d(g), d(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount));
  return `#${[l(r), l(g), l(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Perceived luminance — decides whether card text should be light or dark. */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** Text colours that stay legible on a gradient starting at `hex`. */
export function textColorsFor(hex: string): { fg: string; fgDim: string } {
  const light = isLightColor(hex);
  return {
    fg: light ? '#241A38' : '#FFFFFF',
    fgDim: light ? 'rgba(36,26,56,.6)' : 'rgba(255,255,255,.65)',
  };
}

/** A bank-brand-tinted skin: `hex` fading to a darker shade of itself. */
export function brandSkin(hex: string): CardArtFallback {
  return {
    gradient: [hex, darken(hex, 0.45)],
    ...textColorsFor(hex),
  };
}
