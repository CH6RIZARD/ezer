// =============================================================================
// EZER — legacy /savings route (superseded)
//
// The old standalone withdraw screen used to live here. Savings is now a
// first-class TAB at `app/(tabs)/savings.tsx`, which tracks balance, transfers,
// withdrawals and the smart-saving ledger.
//
// This file cannot simply be removed yet, and leaving the old screen in place
// was actively harmful for two reasons:
//
//   1. ROUTE COLLISION. `(tabs)` is a route GROUP — parentheses add no path
//      segment — so `app/savings.tsx` and `app/(tabs)/savings.tsx` BOTH resolve
//      to `/savings`. Expo Router then has two candidates for one path.
//   2. It wrote balances via `updateGoal(id, { currentAmount })`, bypassing the
//      new transaction ledger, so any withdrawal made through it would silently
//      never appear in Recent activity.
//
// Redirecting makes the outcome correct whichever candidate the router picks.
//
// TODO: delete this file and its `<Stack.Screen name="savings" />` line in
// `app/_layout.tsx` once convenient — the previous contents remain in git
// history if the old screen is ever needed.
// =============================================================================

import React from 'react';
import { Redirect } from 'expo-router';

export default function LegacySavingsRoute() {
  return <Redirect href="/(tabs)/savings" />;
}
