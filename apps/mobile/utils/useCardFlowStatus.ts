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
import { loadCardDesign, getCardAccessOutcome } from './cardDesignStore';

export function useCardFlowStatus() {
  const [hasCompletedFlow, setHasCompletedFlow] = useState(false);

  const refresh = useCallback(() => {
    let alive = true;
    (async () => {
      const [design, access] = await Promise.all([loadCardDesign(), getCardAccessOutcome()]);
      if (alive) setHasCompletedFlow(!!design && !!access);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(refresh, [refresh]);
  useFocusEffect(refresh);

  return { hasCompletedFlow };
}
