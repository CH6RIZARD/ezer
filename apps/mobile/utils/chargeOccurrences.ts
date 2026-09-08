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

export type RangePreset = 'custom' | 'thisMonth' | 'lastYear';

export function presetRange(preset: Exclude<RangePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();

  if (preset === 'thisMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  // lastYear: the trailing 12 months up to today.
  return {
    start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    end: now,
  };
}
