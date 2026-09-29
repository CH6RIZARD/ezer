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
import { loadCardDesign, getCardAccessOutcome, type CardAccessOutcome } from './cardDesignStore';

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
      const [design, outcome] = await Promise.all([loadCardDesign(), getCardAccessOutcome()]);
      if (!alive) return;
      setHasCompletedFlow(!!design && !!outcome);
      setAccess(outcome);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(refresh, [refresh]);
  useFocusEffect(refresh);

  return { hasCompletedFlow, access };
}
