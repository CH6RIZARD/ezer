// =============================================================================
// EZER Redesign — charge occurrence expansion (handoff §4 "Logic")
//
// Verbatim from the handoff:
//   "expand every subscription into monthly charge occurrences over the
//    trailing 18 months (charge day = sub's renewal day, clamped to 28);
//    filter to selected range; group by merchant; drained total = sum."
//
// The clamp to 28 matters: a subscription renewing on the 31st would otherwise
// roll into the next month in February and be double-counted or skipped.
// =============================================================================

import type { SubscriptionCharge } from '../types';
import {
  demoSubscriptions,
  demoCharges,
  getMerchantById,
} from './demoData';

export type RangePreset = 'custom' | 'thisMonth' | 'lastYear';

export interface ChargeOccurrence {
  subscriptionId: string;
  merchantId: string;
  merchantName: string;
  fundingInstrumentId: string;
  amountCents: number;
  date: Date;
}

export interface MerchantGroup {
  merchantId: string;
  merchantName: string;
  subscriptionId: string;
  totalCents: number;
  count: number;
}

const TRAILING_MONTHS = 18;
/** Handoff: charge day is the renewal day clamped to 28. */
const MAX_CHARGE_DAY = 28;

/**
 * One recurring stream = one merchant billed to one card.
 *
 * Previously the streams were built from `demoSubscriptions` alone, and the
 * card a stream belonged to was read off the merchant's latest charge. That had
 * two consequences on the Wallet screen: only the three merchants that happen
 * to have a Subscription record could ever appear, and every other card in the
 * carousel rendered an empty breakdown. Charges are the source of truth for
 * "what is billed to this card", so the streams are derived from them; the
 * Subscription record, when one exists, only supplies the renewal day and the
 * id used to open the detail screen.
 */
interface RecurringStream {
  subscriptionId: string;
  merchantId: string;
  merchantName: string;
  fundingInstrumentId: string;
  amountCents: number;
  /** Day of month the charge lands on, already clamped to 28. */
  chargeDay: number;
}

function latestFirst(a: SubscriptionCharge, b: SubscriptionCharge): number {
  return new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime();
}

/** Every merchant/card pair present in the demo charge history. */
export function recurringStreams(): RecurringStream[] {
  const groups = new Map<string, SubscriptionCharge[]>();

  for (const charge of demoCharges) {
    const key = `${charge.merchantId}::${charge.fundingInstrumentId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(charge);
    else groups.set(key, [charge]);
  }

  const out: RecurringStream[] = [];

  for (const charges of groups.values()) {
    const latest = [...charges].sort(latestFirst)[0];
    if (!latest || !latest.amountCents) continue;

    const sub = demoSubscriptions.find(s => s.merchantId === latest.merchantId);
    // Renewal day when the subscription is known, otherwise the day the card is
    // actually charged on. Clamped to 28 so a 29th–31st renewal never rolls
    // into the next month in February.
    const rawDay = sub?.renewalDate
      ? new Date(sub.renewalDate).getDate()
      : new Date(latest.chargeTimestamp).getDate();

    out.push({
      // SubscriptionDetail resolves either a subscription id or a merchant id.
      subscriptionId: sub?.id ?? latest.merchantId,
      merchantId: latest.merchantId,
      merchantName: getMerchantById(latest.merchantId)?.canonicalName ?? latest.merchantName,
      fundingInstrumentId: latest.fundingInstrumentId,
      amountCents: latest.amountCents,
      chargeDay: Math.min(Math.max(rawDay, 1), MAX_CHARGE_DAY),
    });
  }

  return out;
}

/**
 * Every monthly occurrence for every recurring stream across the trailing 18
 * months. Computed once per call; the set is small (6 streams x 18 months).
 */
export function allOccurrences(): ChargeOccurrence[] {
  const out: ChargeOccurrence[] = [];
  const now = new Date();

  for (const stream of recurringStreams()) {
    for (let i = 0; i < TRAILING_MONTHS; i++) {
      out.push({
        subscriptionId: stream.subscriptionId,
        merchantId: stream.merchantId,
        merchantName: stream.merchantName,
        fundingInstrumentId: stream.fundingInstrumentId,
        amountCents: stream.amountCents,
        date: new Date(now.getFullYear(), now.getMonth() - i, stream.chargeDay),
      });
    }
  }

  return out;
}

/**
 * Distinct subscriptions billed to a card, ignoring any date range — this is
 * the "N subs" figure printed on the card face, which should not move when the
 * range chips change.
 */
export function activeSubscriptionCount(instrumentId: string | undefined): number {
  if (!instrumentId) return 0;
  return recurringStreams().filter(s => s.fundingInstrumentId === instrumentId).length;
}

/** Occurrences on one card inside [start, end], inclusive of both endpoints. */
export function occurrencesInRange(
  instrumentId: string | undefined,
  start: Date,
  end: Date
): ChargeOccurrence[] {
  // Normalise so an end date picked as "today" still includes today's charges.
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();

  return allOccurrences().filter(o => {
    if (instrumentId && o.fundingInstrumentId !== instrumentId) return false;
    const t = o.date.getTime();
    return t >= from && t <= to;
  });
}

export function groupOccurrencesByMerchant(occ: ChargeOccurrence[]): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>();

  for (const o of occ) {
    const g = map.get(o.merchantId);
    if (g) {
      g.totalCents += o.amountCents;
      g.count += 1;
    } else {
      map.set(o.merchantId, {
        merchantId: o.merchantId,
        merchantName: o.merchantName,
        subscriptionId: o.subscriptionId,
        totalCents: o.amountCents,
        count: 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** Concrete dates for the two non-custom range chips. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();

  if (preset === 'thisMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  // lastYear: the trailing 12 months up to today.
  return {
    start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    end: now,
  };
}
