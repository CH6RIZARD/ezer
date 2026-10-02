// =============================================================================
// EZER Mobile — date-range helpers
//
// This file used to expand `demoSubscriptions` / `demoCharges` into synthetic
// charge occurrences, and those functions shipped in the production bundle
// with no caller. Their only effect was to keep 508 lines of invented
// merchants (Netflix, Spotify, Disney+ …) reachable from a release build,
// which is how the Wallet once listed subscriptions for a user who had
// connected no bank at all.
//
// Everything charge-shaped now comes from the API. What remains here is the
// pure date arithmetic the Wallet range picker needs, which never touched
// demo data.
// =============================================================================

export type RangePreset = 'custom' | 'thisMonth' | 'lastMonth' | 'ytd';

/** 23:59:59.999 local on the given calendar day. */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Every preset ends at the END of its last day, for two reasons:
//  - the API filters `date <= endDate` on a DateTime, so an end of "last
//    day at 00:00" drops that whole day for anyone east of UTC;
//  - "ytd" used to end at `new Date()` — millisecond precision — so the
//    Wallet's per-range breakdown cache (keyed on the range) never hit for
//    YTD: the key the prefetch warmed was never the key a tap asked for,
//    and every YTD tap was a round trip while the other presets were not.
export function presetRange(preset: Exclude<RangePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();

  if (preset === 'thisMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  if (preset === 'lastMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }

  // ytd: January 1st of this year through the end of today.
  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: endOfDay(now),
  };
}
