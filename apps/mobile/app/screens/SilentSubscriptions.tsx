// =============================================================================
// EZER — legacy route (superseded)
//
// Drain Review replaced this screen; the Home 'Silent Subs' tile points there now.
//
// The screen that lived here rendered bundled demo subscriptions. Nothing in
// the current UI links to it, but an unreachable screen full of invented
// charges is still a liability: any stray deep link or old notification would
// surface fake money. Redirecting is safer than leaving it, and safer than a
// dangling route that throws.
//
// The original implementation remains in git history.
// =============================================================================

import React from 'react';
import { Redirect } from 'expo-router';

export default function LegacyRoute() {
  return <Redirect href="/screens/DrainReview" />;
}
