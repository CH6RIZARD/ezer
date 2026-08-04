// =============================================================================
// EZER Redesign — merchant mark
//
// Renders a merchant's REAL brand logo in a rounded-square tile (radius ~32% of
// size). Sizes in use: 15px calendar badges, 26px top-ticket row, 38–42px list
// rows, 64px detail header.
//
// Resolution order (first hit wins):
//   1. BUNDLED brand mark  — vector path data compiled into the JS bundle
//      (assets/merchants/brandLogos.ts). Resolved at bundle time, so it cannot
//      fail at runtime: the demo is correct offline, on a plane, on a cold
//      start, every time.
//   2. Plaid-supplied `logoUrl` — `merchant.logo_url` (https) or an institution
//      `logo` (bare base64 PNG, which we wrap into a data: URI).
//   3. Remote CDN — optional enhancement for long-tail merchants only.
//   4. Brand-coloured initial tile — true last resort.
//
// HISTORY / WHY THIS CHANGED:
//   The previous implementation went straight to `https://logo.clearbit.com/`.
//   That host has been decommissioned — it has no A and no AAAA DNS record, so
//   every request fails at name resolution before any HTTP happens. React
//   Native's <Image> fired onError, which latched a `failed` flag forever, and
//   every merchant fell through to the coloured-initial tile. That is exactly
//   the "made up color fill" the user was seeing. Never make the happy path
//   depend on a network call.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fontFamily } from '../../theme/type';
import {
  BRAND_LOGOS,
  LOGO_ALIASES,
  MERCHANT_DOMAIN,
  FALLBACK_BRAND_COLOR,
} from '../../assets/merchants/brandLogos';

/**
 * Reduce a display name / merchant id to a lookup key: lowercased, trimmed,
 * and stripped of the noise that shows up in transaction descriptors
 * ("NETFLIX.COM *SUB", "SPOTIFY USA", "ADOBE  *CREATIVE CLD").
 */
function normalise(raw?: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[*#]/g, ' ')
    .replace(
      /\b(inc|llc|ltd|co|corp|usa|com|subscription|sub|monthly|payment|recurring|bill|autopay)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a name/id to a bundled-logo key, trying exact then loose matches. */
function resolveLogoKey(name?: string, merchantId?: string): string | undefined {
  const candidates = [normalise(merchantId), normalise(name)].filter((c) => c.length > 0);

  for (const c of candidates) {
    if (BRAND_LOGOS[c]) return c;
    if (LOGO_ALIASES[c]) return LOGO_ALIASES[c];
  }

  for (const c of candidates) {
    // "netflix premium 4k" -> the first word still identifies the brand.
    const head = c.split(' ')[0];
    if (BRAND_LOGOS[head]) return head;
    if (LOGO_ALIASES[head]) return LOGO_ALIASES[head];
    // Substring hit, e.g. "apple icloud storage plan".
    for (const key of Object.keys(BRAND_LOGOS)) {
      if (key.length >= 4 && c.includes(key)) return key;
    }
  }

  return undefined;
}

/** Domain lookup for the optional remote step. */
function resolveDomain(name?: string, merchantId?: string): string | undefined {
  for (const c of [normalise(merchantId), normalise(name)]) {
    if (c.length === 0) continue;
    if (MERCHANT_DOMAIN[c]) return MERCHANT_DOMAIN[c];
    const head = c.split(' ')[0];
    if (MERCHANT_DOMAIN[head]) return MERCHANT_DOMAIN[head];
  }
  return undefined;
}

/**
 * Public favicon/logo CDN, no API key. Used only when there is no bundled mark
 * and no Plaid logo. (Clearbit's endpoint is dead — see the header note.)
 */
function cdnUrl(domain: string, size: number): string {
  const px = Math.min(256, Math.max(64, Math.round(size * 3))); // 3x for retina
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${px}`;
}

/** Accept an https/data URI, or a bare base64 PNG the way Plaid returns it. */
function normaliseLogoUrl(logoUrl?: string): string | undefined {
  const v = (logoUrl ?? '').trim();
  if (v.length === 0) return undefined;
  if (v.startsWith('http') || v.startsWith('data:')) return v;
  return `data:image/png;base64,${v}`;
}

export function MerchantMark({
  name,
  merchantId,
  size = 40,
  /** Plaid-supplied logo (https URL or base64). */
  logoUrl,
}: {
  name: string;
  merchantId?: string;
  size?: number;
  logoUrl?: string;
}) {
  // Track WHICH uri failed rather than a bare boolean, so a later prop change
  // (e.g. Plaid data finally arriving) is not permanently poisoned by an
  // earlier miss.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  // Which uri has actually decoded. Tracked by uri rather than as a boolean for
  // the same reason as failedUri: a prop change must not inherit the old state.
  const [loadedUri, setLoadedUri] = useState<string | null>(null);

  // Handoff: radius ≈ 32% of size.
  const r = Math.round(size * 0.32);

  // Computed up front: the branded initial tile is both the last-resort render
  // AND the placeholder shown underneath a remote logo while it loads.
  const fallbackKey = normalise(name);
  const fallbackBg =
    FALLBACK_BRAND_COLOR[fallbackKey] ??
    FALLBACK_BRAND_COLOR[fallbackKey.split(' ')[0]] ??
    '#6E6580';
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const initialStyle = {
    fontFamily: fontFamily.bold,
    fontSize: Math.max(8, size * 0.46),
    color: '#FFFFFF',
  } as const;

  // ---- 1. Bundled brand mark -------------------------------------------
  const logoKey = resolveLogoKey(name, merchantId);
  const bundled = logoKey ? BRAND_LOGOS[logoKey] : undefined;

  if (bundled) {
    const pad = Math.round(size * bundled.inset);
    const inner = Math.max(1, size - pad * 2);
    return (
      <View
        style={[
          styles.tile,
          { width: size, height: size, borderRadius: r, backgroundColor: bundled.bg },
        ]}
      >
        <Svg width={inner} height={inner} viewBox="0 0 24 24">
          <Path d={bundled.d} fill={bundled.fg} />
        </Svg>
      </View>
    );
  }

  // ---- 2. Plaid logo, then 3. remote CDN --------------------------------
  const plaid = normaliseLogoUrl(logoUrl);
  const domain = resolveDomain(name, merchantId);
  const remote = plaid ?? (domain ? cdnUrl(domain, size) : undefined);

  if (remote !== undefined && failedUri !== remote) {
    const isLoaded = loadedUri === remote;

    // The tile starts as the branded initial and only turns white once the
    // logo has decoded. Previously it was white from the first frame with the
    // Image mounted straight into it, so every remote mark flashed an empty
    // white square — and stayed one for as long as the request took, which on
    // a cold or slow network is most of the time the row is on screen. A blank
    // white box is not a state the redesign has: the initial tile is.
    return (
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: r,
            backgroundColor: isLoaded ? '#FFFFFF' : fallbackBg,
          },
        ]}
      >
        {!isLoaded && <Text style={initialStyle}>{initial}</Text>}
        <Image
          source={{ uri: remote }}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: r,
            // Swapped rather than unmounted, so the decode is never restarted.
            opacity: isLoaded ? 1 : 0,
          }}
          resizeMode="contain"
          onLoad={() => setLoadedUri(remote)}
          onError={() => setFailedUri(remote)}
        />
      </View>
    );
  }

  // ---- 4. Coloured initial — true last resort --------------------------
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: r, backgroundColor: fallbackBg },
      ]}
    >
      <Text style={initialStyle}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default MerchantMark;
