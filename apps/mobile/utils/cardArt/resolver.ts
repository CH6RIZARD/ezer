// =============================================================================
// Card art resolver — pure, no React, no I/O
//
// First hit wins:
//
//   1. user_photo     the user's own photo of the card. Explicit user action,
//                     and the only source that can match the exact plastic
//                     (affinity designs included).
//   2. user_design    a look the user picked from the catalog.
//   3. network_token  issuer-approved art from Visa/Mastercard. Only exists for
//                     cards we hold a network token for (cards the user entered
//                     in full) — never for aggregator-linked cards. Its display
//                     is governed by the networks' rules, see BankCardFace.
//   4. catalog        our rendering for the matched issuer, in the bank's REAL
//                     brand colour when Plaid supplied one, and in a metal /
//                     dark finish when the product name says so ("Platinum").
//   5. template       bank colour + logo on a generic template. Always resolves.
//
// Explicit user choices outrank automatic sources: someone who photographed
// their card, or picked a look, wants that — even if a network image exists.
//
// Nothing here can reproduce a specific card's artwork (no data source has it).
// Steps 4-5 aim for "reads as the same card at a glance": right colour, right
// logo, right finish.
// =============================================================================

import { getDesign, defaultDesignFor } from './catalog';
import { brandSkin, darken, isHexColor, lighten, normalizeHex, textColorsFor } from './color';
import { matchIssuer } from './matching';
import type {
  CardArtFallback,
  CardArtInput,
  CardArtPrefs,
  CardDesign,
  Gradient,
  ResolvedCardArt,
} from './types';

/** Used only when nothing at all is known about the card. */
const NEUTRAL_FALLBACK: CardArtFallback = {
  gradient: ['#3A3D45', '#15171C'],
  fg: '#FFFFFF',
  fgDim: 'rgba(255,255,255,.65)',
};

type Finish = NonNullable<ResolvedCardArt['finish']>;

const FINISH_GRADIENTS: Record<Finish, { gradient: Gradient; pattern: ResolvedCardArt['pattern'] }> = {
  silver: { gradient: ['#DDE0E6', '#9AA0AB'], pattern: 'diagonal' },
  gold: { gradient: ['#E9D9B8', '#C4A15A', '#9A7838'], pattern: 'wave' },
  obsidian: { gradient: ['#2E2F35', '#0A0A0C'], pattern: 'diagonal' },
};

// Whole-word product names that imply a finish on real cards. Order matters:
// the first list that matches wins, so a "Black Platinum" reads as dark.
const FINISH_KEYWORDS: [Finish, readonly string[]][] = [
  ['obsidian', ['black', 'reserve', 'infinite', 'world elite', 'obsidian', 'onyx']],
  ['gold', ['gold']],
  ['silver', ['platinum', 'titanium', 'premier', 'silver']],
];

/** Picks a finish from an account's product name, or undefined. */
export function finishFor(productName: string | undefined): Finish | undefined {
  if (!productName) return undefined;
  const padded = ` ${productName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  for (const [finish, words] of FINISH_KEYWORDS) {
    if (words.some(w => padded.includes(` ${w} `))) return finish;
  }
  return undefined;
}

/**
 * Re-tints a generated design with the bank's real brand colour from Plaid.
 * Our catalog hues are approximations; Plaid's `primary_color` is the bank's
 * own, so it wins whenever we have it. "Night" keeps its dark secondary.
 */
export function recolorDesign(design: CardDesign, brandHex: string | undefined): CardDesign {
  if (!isHexColor(brandHex)) return design;
  const hex = normalizeHex(brandHex);
  if (design.variant === 'classic') return { ...design, gradient: [hex, darken(hex, 0.45)] };
  if (design.variant === 'light') return { ...design, gradient: [lighten(hex, 0.88), lighten(hex, 0.62)] };
  return design;
}

function fromDesign(
  design: CardDesign,
  tier: 'user_design' | 'catalog',
  logoUri: string | undefined,
): ResolvedCardArt {
  return {
    tier,
    gradient: design.gradient,
    ...textColorsFor(design.gradient[0]),
    pattern: design.pattern,
    logoUri,
    issuerId: design.issuerId,
    designId: design.id,
    maskNumberBand: false,
  };
}

export function resolveCardArt(
  input: CardArtInput,
  prefs: CardArtPrefs = {},
  fallback: CardArtFallback = NEUTRAL_FALLBACK,
): ResolvedCardArt {
  const issuer = matchIssuer(input.institutionName);
  const logoUri = input.logoUri;

  // 1. The user's own photo.
  if (prefs.photoUri) {
    return {
      tier: 'user_photo',
      gradient: fallback.gradient,
      fg: '#FFFFFF',
      fgDim: 'rgba(255,255,255,.75)',
      pattern: 'solid',
      imageUri: prefs.photoUri,
      issuerId: issuer?.id,
      maskNumberBand: true,
    };
  }

  // 2. A design the user picked. An id that no longer exists (catalog changed)
  //    is ignored rather than treated as an error.
  const picked = getDesign(prefs.designId);
  if (picked) return fromDesign(recolorDesign(picked, input.issuerColorHint), 'user_design', logoUri);

  // 3. Network-token art.
  if (input.networkTokenArtUri) {
    return {
      tier: 'network_token',
      gradient: fallback.gradient,
      fg: '#FFFFFF',
      fgDim: 'rgba(255,255,255,.75)',
      pattern: 'solid',
      imageUri: input.networkTokenArtUri,
      issuerId: issuer?.id,
      maskNumberBand: false,
    };
  }

  // 4a. The product name implies a finish ("Platinum", "Reserve", "Gold"): a
  //     metal or dark card reads as that product far more than the bank's
  //     colour does. The bank's logo and name still identify it.
  const finish = finishFor(input.displayName);
  if (finish) {
    const f = FINISH_GRADIENTS[finish];
    return {
      tier: 'catalog',
      gradient: f.gradient,
      ...textColorsFor(f.gradient[0]),
      pattern: f.pattern,
      logoUri,
      issuerId: issuer?.id,
      finish,
      maskNumberBand: false,
    };
  }

  // 4b. Our catalog rendering for the matched issuer, in Plaid's real colour.
  if (issuer) {
    return fromDesign(recolorDesign(defaultDesignFor(issuer.id), input.issuerColorHint), 'catalog', logoUri);
  }

  // 5. Template: the bank's own colour if Plaid gave us one, else the caller's
  //    fallback skin (the wallet passes its existing cycling skins).
  const skin = isHexColor(input.issuerColorHint)
    ? brandSkin(normalizeHex(input.issuerColorHint))
    : fallback;
  return {
    tier: 'template',
    gradient: skin.gradient,
    fg: skin.fg,
    fgDim: skin.fgDim,
    pattern: 'solid',
    logoUri,
    maskNumberBand: false,
  };
}
