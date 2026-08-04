// =============================================================================
// EZER — calendar recurrence projection
//
// The dashboard calendar used to render straight from `risks`, which is a
// 0–30 day risk window. That is the right source for "what is about to hit me",
// and the wrong source for a calendar: a monthly subscription appeared exactly
// once, ever, and every month after the current one was blank.
//
// A subscription is a RULE, not a single dated event. This projects that rule
// into whatever month is on screen, forwards or backwards, from the anchor
// renewal date and the cadence.
//
// Trials are the exception and stay one-off: a trial ends once. Its conversion
// comes from the risk feed, and the recurring charges that follow are projected
// from the subscription itself.
// =============================================================================

import type { RiskItem, Subscription } from '../contexts/DataContext';

export interface CalendarEvent {
  id: string;
  subscriptionId: string;
  merchantId: string;
  merchantName: string;
  logo?: string;
  amountCents: number;
  type: 'renewal' | 'trial';
  date: Date;
  /** After-trial price, for the popover's "becomes $X/mo" line. */
  afterTrialCents?: number;
}

const clampDayToMonth = (year: number, month: number, day: number) =>
  Math.min(day, new Date(year, month + 1, 0).getDate());

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Every occurrence of one subscription that falls inside the given month.
 *
 * Works in both directions from the anchor — scrolling back to a past month
 * shows what was charged then, which is the whole point of a spending calendar.
 */
function occurrencesInMonth(
  anchor: Date,
  cadence: string,
  year: number,
  month: number
): Date[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const out: Date[] = [];

  switch (cadence) {
    case 'weekly': {
      // Walk back to the first occurrence on or after the 1st.
      const step = 7 * 24 * 60 * 60 * 1000;
      const diff = monthStart.getTime() - anchor.getTime();
      const periods = Math.ceil(diff / step);
      let d = new Date(anchor.getTime() + periods * step);
      while (d <= monthEnd) {
        if (d >= monthStart) out.push(new Date(d));
        d = new Date(d.getTime() + step);
      }
      break;
    }

    case 'yearly': {
      // Only lands in the month that matches the anchor's month.
      if (anchor.getMonth() === month) {
        out.push(new Date(year, month, clampDayToMonth(year, month, anchor.getDate())));
      }
      break;
    }

    case 'monthly':
    default: {
      // Every month, on the anchor's day-of-month. Clamped so a 31st anchor
      // lands on the 30th in September and the 28th/29th in February rather
      // than rolling into the next month.
      out.push(new Date(year, month, clampDayToMonth(year, month, anchor.getDate())));
      break;
    }
  }

  return out;
}

/**
 * All charge events for the month being viewed.
 *
 * @param subscriptions live subscriptions (API or demo-backed)
 * @param risks         the 0–30 day window, used ONLY for trial conversions
 *                      and as a price source for subscriptions that carry none
 */
export function projectMonthEvents(
  subscriptions: Subscription[],
  risks: RiskItem[],
  year: number,
  month: number
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Price fallback: a Subscription may not carry an amount, but if it is inside
  // the risk window the risk feed knows what it costs.
  const priceBySubId = new Map<string, number>();
  for (const r of risks) {
    if (r.amountCents > 0) priceBySubId.set(r.subscriptionId, r.amountCents);
  }

  const trialSubIds = new Set(risks.filter(r => r.type === 'trial').map(r => r.subscriptionId));

  // --- trial conversions: one-off, never projected ---------------------------
  for (const r of risks) {
    if (r.type !== 'trial') continue;
    const d = new Date(r.dueDate);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;

    events.push({
      id: `trial-${r.subscriptionId}-${d.toDateString()}`,
      subscriptionId: r.subscriptionId,
      merchantId: r.subscriptionId,
      merchantName: r.merchantName,
      logo: r.logo,
      amountCents: r.amountCents,
      afterTrialCents: r.amountCents,
      type: 'trial',
      date: startOfDay(d),
    });
  }

  // --- recurring renewals ----------------------------------------------------
  for (const sub of subscriptions) {
    if (sub.status === 'canceled' || sub.status === 'paused') continue;
    if (!sub.renewalDate) continue;

    const anchor = startOfDay(new Date(sub.renewalDate));
    if (Number.isNaN(anchor.getTime())) continue;

    const amount = sub.amountCents ?? priceBySubId.get(sub.id) ?? 0;
    // A renewal with no known price is not worth drawing — it would render as
    // "-$0.00", which reads as a bug rather than as missing data.
    if (amount <= 0) continue;

    for (const date of occurrencesInMonth(anchor, sub.cadence, year, month)) {
      // A still-running trial converts on its end date; that conversion is
      // already emitted above, so skip the renewal that lands on the same day.
      if (trialSubIds.has(sub.id) && date.getTime() === anchor.getTime()) continue;

      events.push({
        id: `renewal-${sub.id}-${date.toDateString()}`,
        subscriptionId: sub.id,
        merchantId: sub.merchantId,
        merchantName: sub.merchantName,
        logo: sub.logo,
        amountCents: amount,
        type: 'renewal',
        date,
      });
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Bucket by day-of-month for O(1) cell lookup. */
export function groupEventsByDay(events: CalendarEvent[]): Map<number, CalendarEvent[]> {
  const map = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const day = e.date.getDate();
    map.set(day, [...(map.get(day) ?? []), e]);
  }
  return map;
}
