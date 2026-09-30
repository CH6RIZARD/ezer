// =============================================================================
// EZER — Settings' "Linked banks" data
//
// Shared between settings.tsx, screens/BankDetail.tsx and
// components/redesign/PayIn4AccountPicker.tsx so all three read the exact
// same shape GET /plaid/linked-banks returns (apps/api/src/routes/plaid.ts).
// =============================================================================

import { api } from './api';
import { matchIssuer } from './cardArt/matching';

export type LinkedBankAccount = {
  instrumentId: string;
  displayName: string;
  last4: string;
  subtype: string | null;
  /** 'bank' = depository (checking/savings), 'card' = credit. Only 'bank'
   *  accounts can fund Pay in 4. */
  type: 'card' | 'bank';
  isPayIn4: boolean;
  eligibleForPayIn4: boolean;
};

export type LinkedBankItem = {
  itemId: string;
  institutionName: string | null;
  connectedAt: string;
  readForSubscriptions: boolean;
  accounts: LinkedBankAccount[];
};

export type LinkedBanksData = {
  payIn4InstrumentId: string | null;
  items: LinkedBankItem[];
};

export async function fetchLinkedBanks(): Promise<LinkedBanksData | null> {
  try {
    const res = await api.get<{ success: boolean; data: LinkedBanksData }>('/plaid/linked-banks');
    return res?.data ?? null;
  } catch {
    return null;
  }
}

/** The one FundingInstrument.id a bank's row holds that funds Pay in 4, if any. */
export function payIn4AccountFor(item: LinkedBankItem): LinkedBankAccount | null {
  return item.accounts.find(a => a.isPayIn4) ?? null;
}

export function initialFor(name: string | null): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/**
 * The bank's own brand color for its initial tile, from the SAME catalog
 * `utils/cardArt` already uses to tint a linked card's art
 * (`utils/cardArt/matching.ts`'s `matchIssuer`) — not an invented per-bank
 * palette. Null for a bank not in the catalog; callers fall back to a
 * neutral theme color (`colors.accInk`) rather than guessing a color for an
 * issuer nobody's added yet.
 */
export function tintFor(institutionName: string | null): string | null {
  return matchIssuer(institutionName ?? undefined)?.primary ?? null;
}
