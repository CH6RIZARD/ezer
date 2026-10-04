// =============================================================================
// EZER — legacy route (superseded)
//
// The old BNPL "Saved" tab is replaced by the Pay in 4 tab. The route stays
// registered (hidden from the bar in (tabs)/_layout.tsx) so stray deep links
// land somewhere real instead of throwing.
//
// The original implementation remains in git history.
// =============================================================================

import React from 'react';
import { Redirect } from 'expo-router';

export default function LegacyRoute() {
  return <Redirect href="/(tabs)/payin4" />;
}
