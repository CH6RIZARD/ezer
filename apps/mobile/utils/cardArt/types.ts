// =============================================================================
// Card art — shared types
//
// A wallet card's *appearance* is resolved from several possible sources, best
// first. No bank-data aggregator (Plaid, MX, Finicity, Yodlee, Teller, Akoya)
// returns card art, so "the real card" only ever comes from (a) network-token
// art for a card the user entered in full, or (b) the user's own photo. The
// rest are honest approximations. See resolver.ts for the ordering.
// =============================================================================

/** Which source produced the art. Ordered here from most to least specific. */
export type CardArtTier =
  /** The user's own photo of their physical card, stored on this device only. */
  | 'user_photo'
  /** A design the user explicitly picked from the catalog. */
  | 'user_design'
  /** Issuer-approved art returned by Visa/Mastercard for a tokenized card. */
  | 'network_token'
  /** Our own rendering for this issuer, matched automatically. */
  | 'catalog'
  /** Bank color + logo on a generic template. Every card gets at least this. */
  | 'template';

/** Two or more gradient stops (the wallet's gold skin uses three). */
export type Gradient = readonly [string, string, ...string[]];

export type DesignPattern = 'solid' | 'wave' | 'diagonal' | 'dots' | 'rings';

/** One selectable look, drawn by us from style tokens — never a scraped image. */
export interface CardDesign {
  id: string;
  issuerId: string;
  label: string;
  gradient: readonly [string, string];
  pattern: DesignPattern;
  /** The design used automatically when nothing more specific is known. */
  isDefault?: boolean;
}

export interface Issuer {
  id: string;
  /** Display name, used in the picker. */
  name: string;
  /**
   * Alternative spellings of the bank's name. Compared as whole-word
   * sequences after normalisation, so "citi" does not match "Citizens Bank".
   */
  aliases: readonly string[];
  /** Approximate brand hues, used to generate the issuer's designs. */
  primary: string;
  secondary: string;
}

/** What we know about a linked card. All optional — resolution degrades. */
export interface CardArtInput {
  institutionName?: string;
  displayName?: string;
  brand?: string;
  /** Plaid's `primary_color` for the institution. */
  issuerColorHint?: string;
  /** Bank logo URL or data URI. */
  logoUri?: string;
  /**
   * Network-issued card art for a card we hold a network token for. Only set
   * for cards the user entered in full (e.g. the BNPL repayment card); never
   * available for aggregator-linked cards.
   */
  networkTokenArtUri?: string;
}

/** Per-card choices the user has made. Stored on-device only. */
export interface CardArtPrefs {
  photoUri?: string;
  designId?: string;
}

export interface CardArtFallback {
  gradient: Gradient;
  fg: string;
  fgDim: string;
}

export interface ResolvedCardArt {
  tier: CardArtTier;
  gradient: Gradient;
  fg: string;
  fgDim: string;
  pattern: DesignPattern;
  /**
   * Full-bleed artwork (user photo or network art). When set, the gradient and
   * pattern are not drawn.
   */
  imageUri?: string;
  /** Bank logo to draw top-right on gradient tiers. */
  logoUri?: string;
  issuerId?: string;
  designId?: string;
  /**
   * True when `imageUri` is a photo of a real card, whose printed number must
   * be covered on screen. Network art carries no PAN, so it is never masked.
   */
  maskNumberBand: boolean;
}
