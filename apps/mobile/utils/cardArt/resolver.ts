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
//   4. catalog        our rendering for the matched issuer's default design.
//   5. template       bank colour + logo on a generic template. Always resolves.
//
// Explicit user choices outrank automatic sources: someone who photographed
// their card, or picked a look, wants that — even if a network image exists.
// =============================================================================

import { getDesign, defaultDesignFor } from './catalog';
import { brandSkin, isHexColor, normalizeHex, textColorsFor } from './color';
import { matchIssuer } from './matching';
import type {
  CardArtFallback,
  CardArtInput,
  CardArtPrefs,
  CardDesign,
  ResolvedCardArt,
} from './types';

/** Used only when nothing at all is known about the card. */
const NEUTRAL_FALLBACK: CardArtFallback = {
  gradient: ['#3A3D45', '#15171C'],
  fg: '#FFFFFF',
  fgDim: 'rgba(255,255,255,.65)',
};

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
  if (picked) return fromDesign(picked, 'user_design', logoUri);

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

  // 4. Our catalog rendering for the matched issuer.
  if (issuer) return fromDesign(defaultDesignFor(issuer.id), 'catalog', logoUri);

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
