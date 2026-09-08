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
      router.replace('/screens/Paywall');
    }
  }, [status]);
}
