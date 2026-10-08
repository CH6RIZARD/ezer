// =============================================================================
// EZER — Card Studio flow status
//
// Answers exactly one question for the Home entry tile: has this user already
// saved a design AND been through approval to a terminal state? If so, "Get
// your physical card" should open the finished-design review
// (PhysicalCardReview.tsx), not dump them back into the blank/edit designer
// they already finished with.
//
// Refreshes on focus, not just on mount — Home stays mounted underneath the
// designer/approval stack, so returning to it after finishing the flow must
// pick up the new state without a full app restart.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  loadCardDesign,
  getCardAccessOutcome,
  fetchServerAccessOutcome,
  mirrorServerAccessOutcome,
  type CardAccessOutcome,
} from './cardDesignStore';

export function useCardFlowStatus() {
  const [hasCompletedFlow, setHasCompletedFlow] = useState(false);
  // Home's Spending Power tile needs the actual outcome, not just whether
  // the flow finished — "assessed, no limit yet" and "never assessed at
  // all" were rendering identically (both a bare "—"), which read as the
  // tile being permanently broken to anyone who had actually gone through
  // approval and landed on manual_review.
  const [access, setAccess] = useState<CardAccessOutcome | null>(null);

  const refresh = useCallback(() => {
    let alive = true;
    (async () => {
      const [design, localOutcome] = await Promise.all([loadCardDesign(), getCardAccessOutcome()]);
      if (!alive) return;

      // Local storage is the fast path, but it is only a mirror of a decision
      // the server already made — a reinstall, a cleared app, or a second
      // device wipes it while the real outcome still sits in Postgres. Before
      // this fallback, that meant Home's Spending Power tile went right back
      // to "not yet assessed" for someone who had already connected a bank
      // and gotten a real answer: the assessment theatre would run again,
      // finish, and the tile still wouldn't show anything. Only worth the
      // network call when local storage came back genuinely empty.
      let outcome = localOutcome;
      if (!outcome) {
        outcome = await fetchServerAccessOutcome();
        if (!alive) return;
        if (outcome) void mirrorServerAccessOutcome(outcome);
      }

      setHasCompletedFlow(!!design && !!outcome);
      // Same outcome → same state object. This runs on EVERY focus of Home,
      // and a fresh object each time re-rendered the whole Home tree
      // (calendar included) on every tab switch back to it: the DIAG
      // timeline showed that render 0.75s after the tap and the screen
      // changing seconds later. Changing nothing must render nothing.
      setAccess(prev =>
        prev === outcome || (prev && outcome && JSON.stringify(prev) === JSON.stringify(outcome)) ? prev : outcome
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(refresh, [refresh]);
  useFocusEffect(refresh);

  return { hasCompletedFlow, access };
}
