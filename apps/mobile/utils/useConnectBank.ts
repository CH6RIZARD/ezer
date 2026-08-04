// =============================================================================
// EZER — one bank-connect flow, shared by every entry point
//
// Linking a bank is four steps, and every caller needs all four:
//
//   1. create a Link token            (POST /plaid/create-link-token)
//   2. open Plaid Link                (native SDK)
//   3. exchange the public token      (POST /plaid/exchange-public-token)
//   4. SYNC, then REFRESH             (POST /plaid/sync, then DataContext)
//
// Step 4 is the one that is easy to forget and the reason this hook exists.
// `usePlaid` stops after the exchange, which stores the item and creates
// funding instruments but does NOT pull transactions — so a user who linked a
// bank would land back on a dashboard that was still empty and reasonably
// conclude it had failed. Sync detects the recurring charges; refresh pulls the
// results into the UI.
//
// Every place that offers "connect a bank" must go through here, so the
// behaviour cannot drift between the dashboard tile and Settings.
// =============================================================================

import { useCallback, useState } from 'react';
import { usePlaid } from './usePlaid';
import { useData } from '../contexts/DataContext';

export type ConnectStage = 'idle' | 'linking' | 'syncing' | 'done' | 'error';

export function useConnectBank() {
  const { openPlaidLink } = usePlaid();
  const { refresh, instruments, subscriptions } = useData();

  const [stage, setStage] = useState<ConnectStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const connected = instruments.length > 0 || subscriptions.length > 0;

  const connect = useCallback(
    async (onDone?: () => void) => {
      setError(null);
      setStage('linking');

      // openPlaidLink can return WITHOUT ever firing onSuccess or onExit — the
      // native module being absent shows an Alert and returns, and a thrown
      // error before `open()` does the same. The stage then sticks on
      // "Opening your bank…" forever with no way back, which is what the
      // Settings row was showing. This guarantees a terminal state.
      let settled = false;
      const finish = (next: ConnectStage, message?: string) => {
        settled = true;
        if (message) setError(message);
        setStage(next);
      };

      await openPlaidLink(
        // --- success: exchange already happened inside usePlaid -------------
        async () => {
          setStage('syncing');
          try {
            // Pull transactions and run recurring detection. Without this the
            // account is linked but the app still has nothing to show.
            const { api } = await import('./api');
            await api.post('/plaid/sync');
          } catch (err: any) {
            // A sync failure is recoverable — the item IS linked, and the next
            // refresh or a later sync will pick the transactions up. Surface it
            // without pretending the whole link failed.
            console.log('[useConnectBank] sync failed:', err?.message);
          }

          try {
            await refresh();
          } finally {
            finish('done');
            onDone?.();
          }
        },
        // --- exit: user closed Link, or Plaid errored -----------------------
        exit => {
          if (exit?.error?.errorMessage) {
            finish('error', exit.error.errorMessage);
          } else {
            // Plain dismissal is not an error state.
            finish('idle');
          }
        }
      );

      // If neither callback ran, Link never opened. Fall back to idle rather
      // than leaving a spinner the user cannot dismiss.
      if (!settled) setStage('idle');
    },
    [openPlaidLink, refresh]
  );

  const busy = stage === 'linking' || stage === 'syncing';

  const label =
    stage === 'linking' ? 'Opening your bank…' : stage === 'syncing' ? 'Finding subscriptions…' : null;

  return { connect, stage, busy, label, error, connected };
}

export default useConnectBank;
