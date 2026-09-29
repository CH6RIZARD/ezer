// =============================================================================
// EZER Mobile — premium gate
//
// One hook instead of the same useEffect copied into every gated tab. Three
// tabs carried identical redirects and three did not, so an expired user could
// walk into the ungated ones; worse, three copies of a condition drift, and a
// paywall that leaks on one tab is a paywall that does nothing.
//
// `replace`, not `push`: an expired session has nothing behind the paywall to
// go back to, and leaving the tab on the stack lets the back gesture return to
// content the user no longer has access to.
// =============================================================================

import { useEffect } from 'react';
import { router } from 'expo-router';
import { usePremium } from './PremiumContext';
import { isLoosePreviewMode } from './expoRuntime';

// Module-level, not per-hook-instance: every gated tab (Home, Wallet, Saved,
// Savings) calls this hook independently, and expo-router's default tab
// behavior keeps inactive tabs mounted rather than unmounting them. When
// status flips to 'expired', every mounted tab's effect fires within the
// same tick, and each called router.replace('/screens/Paywall') on its own
// — not a no-op when the target is already current, but a genuine second
// push, stacking duplicate Paywall screens visibly on top of each other.
// Switching tabs mounted more of them, so more redirects fired, compounding
// into a broken screen the more you navigated. One shared timestamp lets
// only the first caller in a short window actually navigate.
let lastRedirectAt = 0;

/**
 * Redirects to the paywall when the trial has expired.
 *
 * Deliberately keyed on 'expired' alone. 'loading' must not redirect — the
 * status resolves asynchronously and gating on it would bounce every user to
 * the paywall for a frame on every cold start. 'trial' and 'premium' both have
 * access; the difference between them belongs to individual features, not to
 * whether a tab opens.
 */
export function usePremiumGate(): void {
  const { status } = usePremium();

  useEffect(() => {
    if (status === 'expired' && !isLoosePreviewMode()) {
      const now = Date.now();
      if (now - lastRedirectAt < 1000) return;
      lastRedirectAt = now;
      router.replace('/screens/Paywall');
    }
  }, [status]);
}
