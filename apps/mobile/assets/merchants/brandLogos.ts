// =============================================================================
// EZER — bundled merchant brand marks
//
// Real brand artwork, compiled into the JS bundle as vector path data.
//
// WHY NOT .png/.svg FILES:
//   * Metro has no SVG transformer configured in this app (see metro.config.js),
//     so `require('./netflix.svg')` would not produce a renderable component.
//   * Raster PNGs would need one file per brand per density and still look soft
//     at the 15px calendar-badge size.
//   Path data in a `.ts` module gives the same guarantee that matters — it is
//   resolved at BUNDLE time and can never fail at runtime, offline or not —
//   while staying pin-sharp from 15px to 64px.
//
// The `d` strings are the official single-path brand glyphs on a 24x24 grid
// (Simple Icons vectorisations of each company's own mark), not hand-drawn
// approximations. The one exception is `fitpass`, a fictional demo brand with
// no real logo; its mark is a hand-built dumbbell glyph.
// =============================================================================

export type BrandLogo = {
  /** Single SVG path on a 0 0 24 24 viewBox. */
  d: string;
  /** Glyph fill colour. */
  fg: string;
  /** Tile background behind the glyph. */
  bg: string;
  /**
   * Fraction of the tile left as padding on each side (0 = full bleed).
   * Tuned per mark so every logo reads at the same optical weight.
   */
  inset: number;
};

/**
 * Bundled marks, keyed by normalised merchant name / id.
 * Add an alias to `LOGO_ALIASES` rather than duplicating an entry here.
 */
export const BRAND_LOGOS: Record<string, BrandLogo> = {
  netflix: {
    d: 'M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z',
    fg: '#E50914',
    bg: '#000000',
    inset: 0.16,
  },
  hulu: {
    d: 'M14.707 15.957h1.912V8.043h-1.912zm-3.357-2.256a.517.517 0 01-.512.511H9.727a.517.517 0 01-.512-.511v-3.19H7.303v3.345c0 1.368.879 2.09 2.168 2.09h1.868c1.189 0 1.912-.856 1.912-2.09V10.51h-1.912c.01 0 .01 3.09.01 3.19zm10.75-3.19v3.19a.517.517 0 01-.512.511h-1.112a.517.517 0 01-.511-.511v-3.19h-1.912v3.345c0 1.368.878 2.09 2.167 2.09h1.868c1.19 0 1.912-.856 1.912-2.09V10.51zm-18.32 0H2.557c-.434 0-.645.11-.645.11V8.044H0v7.903h1.9v-3.179c0-.278.234-.511.512-.511h1.112c.278 0 .511.233.511.511v3.19h1.912v-3.446c0-1.445-.967-2-2.167-2Z',
    fg: '#FFFFFF',
    bg: '#1CE783',
    inset: 0.1,
  },
  spotify: {
    d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
    fg: '#1DB954',
    bg: '#FFFFFF',
    inset: 0.05,
  },
  icloud: {
    d: 'M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3A4.918 4.918 0 0 0 0 14.796a4.918 4.918 0 0 0 4.92 4.914 4.93 4.93 0 0 0 .617-.045h14.42c2.305-.272 4.041-2.258 4.043-4.589v-.009a4.594 4.594 0 0 0-3.727-4.508 6.51 6.51 0 0 0-6.511-6.27z',
    fg: '#3693F3',
    bg: '#FFFFFF',
    inset: 0.1,
  },
  apple: {
    d: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
    fg: '#000000',
    bg: '#FFFFFF',
    inset: 0.2,
  },
  youtube: {
    d: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    fg: '#FF0000',
    bg: '#FFFFFF',
    inset: 0.06,
  },
  adobe: {
    d: 'M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm15.116 0h-8.884L24 22.624Z',
    fg: '#FA0F00',
    bg: '#FFFFFF',
    inset: 0.12,
  },
  openai: {
    d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    fg: '#FFFFFF',
    bg: '#000000',
    inset: 0.18,
  },
  max: {
    d: 'M1.769 0A1.77 1.77 0 0 0 0 1.769V22.23A1.77 1.77 0 0 0 1.769 24H22.23A1.77 1.77 0 0 0 24 22.231V1.77A1.77 1.77 0 0 0 22.231 0zm12.485 3.28a4.301 4.301 0 0 1 4.3 4.302 4.301 4.301 0 0 1-1.993 3.63 6.085 6.085 0 0 1 1.054 3.422 6.085 6.085 0 0 1-6.085 6.085 6.085 6.085 0 0 1-6.085-6.085 6.085 6.085 0 0 1 4.66-5.916 4.301 4.301 0 0 1-.152-1.136 4.301 4.301 0 0 1 4.301-4.301zm0 1.849a2.453 2.453 0 0 0-2.453 2.453 2.453 2.453 0 0 0 2.453 2.453 2.453 2.453 0 0 0 2.453-2.453 2.453 2.453 0 0 0-2.453-2.453zm-2.724 5.268a4.237 4.237 0 0 0-4.237 4.237 4.237 4.237 0 0 0 4.237 4.237 4.237 4.237 0 0 0 4.237-4.237 4.237 4.237 0 0 0-4.237-4.237zm.032 2.54a1.781 1.781 0 1 1 0 3.562 1.781 1.781 0 0 1 0-3.562Z',
    fg: '#002BE7',
    bg: '#FFFFFF',
    inset: 0,
  },
  hbo: {
    d: 'M7.042 16.896H4.414v-3.754H2.708v3.754H.01L0 7.22h2.708v3.6h1.706v-3.6h2.628zm12.043.046C21.795 16.94 24 14.689 24 11.978a4.89 4.89 0 0 0-4.915-4.92c-2.707-.002-4.09 1.991-4.432 2.795.003-1.207-1.187-2.632-2.58-2.634H7.59v9.674l4.181.001c1.686 0 2.886-1.46 2.888-2.713.385.788 1.72 2.762 4.427 2.76zm-7.665-3.936c.387 0 .692.382.692.817 0 .435-.305.817-.692.817h-1.33v-1.634zm.005-3.633c.387 0 .692.382.692.817 0 .436-.305.818-.692.818h-1.33V9.373zm1.77 2.607c.305-.039.813-.387.992-.61-.063.276-.068 1.074.006 1.35-.204-.314-.688-.701-.998-.74zm3.43 0a2.462 2.462 0 1 1 4.924 0 2.462 2.462 0 0 1-4.925 0zm2.462 1.936a1.936 1.936 0 1 0 0-3.872 1.936 1.936 0 0 0 0 3.872Z',
    fg: '#FFFFFF',
    bg: '#000000',
    inset: 0.14,
  },
  dropbox: {
    d: 'M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z',
    fg: '#0061FF',
    bg: '#FFFFFF',
    inset: 0.16,
  },
  notion: {
    d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z',
    fg: '#000000',
    bg: '#FFFFFF',
    inset: 0.16,
  },
  // Fictional demo brand — no real logo exists, so this is a hand-built
  // dumbbell glyph (bar + two plates) rather than a vectorised trademark.
  fitpass: {
    d: 'M2 9.6h2.3v4.8H2zM5.3 7.4h2.8v9.2H5.3zM8.7 10.6h6.6v2.8H8.7zM15.9 7.4h2.8v9.2h-2.8zM19.7 9.6H22v4.8h-2.3z',
    fg: '#FFFFFF',
    bg: '#7C3AED',
    inset: 0.16,
  },
};

/**
 * Extra names that map onto a bundled mark. Keys are normalised
 * (lowercased, trimmed) merchant names or merchant ids.
 */
export const LOGO_ALIASES: Record<string, string> = {
  'netflix premium': 'netflix',
  'netflix standard': 'netflix',
  'hulu live tv': 'hulu',
  'spotify premium': 'spotify',
  'spotify family': 'spotify',
  'icloud+': 'icloud',
  'icloud plus': 'icloud',
  'icloud storage': 'icloud',
  'apple icloud': 'icloud',
  'apple music': 'apple',
  'apple tv+': 'apple',
  'apple one': 'apple',
  'youtube premium': 'youtube',
  'youtube music': 'youtube',
  'youtube tv': 'youtube',
  'adobe creative cloud': 'adobe',
  'creative cloud': 'adobe',
  'adobe cc': 'adobe',
  chatgpt: 'openai',
  'chatgpt plus': 'openai',
  'chatgpt pro': 'openai',
  'open ai': 'openai',
  hbomax: 'max',
  'hbo max': 'max',
  'fitpass gym': 'fitpass',
  'fit pass': 'fitpass',
};

/**
 * Canonical domain per merchant, used only for the optional remote CDN step
 * for merchants with no bundled mark.
 */
export const MERCHANT_DOMAIN: Record<string, string> = {
  netflix: 'netflix.com',
  hulu: 'hulu.com',
  spotify: 'spotify.com',
  icloud: 'apple.com',
  apple: 'apple.com',
  youtube: 'youtube.com',
  adobe: 'adobe.com',
  openai: 'openai.com',
  max: 'max.com',
  hbo: 'hbo.com',
  dropbox: 'dropbox.com',
  notion: 'notion.so',
  disney: 'disneyplus.com',
  'disney+': 'disneyplus.com',
  amazon: 'amazon.com',
  'amazon prime': 'amazon.com',
  'prime video': 'primevideo.com',
  google: 'google.com',
  'google one': 'google.com',
  paramount: 'paramountplus.com',
  peacock: 'peacocktv.com',
  audible: 'audible.com',
  duolingo: 'duolingo.com',
  strava: 'strava.com',
  canva: 'canva.com',
  figma: 'figma.com',
  slack: 'slack.com',
  github: 'github.com',
};

/** Fallback tile colours for merchants with neither a bundled mark nor a logo. */
export const FALLBACK_BRAND_COLOR: Record<string, string> = {
  disney: '#113CCF',
  amazon: '#FF9900',
  'prime video': '#00A8E1',
  google: '#4285F4',
  paramount: '#0064FF',
  peacock: '#000000',
  audible: '#F8991C',
  duolingo: '#58CC02',
  strava: '#FC4C02',
  canva: '#00C4CC',
  figma: '#F24E1E',
  slack: '#4A154B',
  github: '#181717',
};
