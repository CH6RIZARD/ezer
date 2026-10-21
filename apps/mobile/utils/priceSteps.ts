// The Subscription detail staircase (handoff Sub 6a): one step per price,
// whatever its duration, so a 4-year run and a 2-month hike read the same.
// Swift: `priceSteps` / `stepHeight` in SubscriptionDetailView.swift.

export interface PriceStep {
  cents: number;
  /** Charges at this price. */
  count: number;
  /** Index of the first / last charge in the oldest-first input. */
  from: number;
  to: number;
}

/** Runs of equal consecutive amounts, oldest first. */
export function priceSteps(amounts: number[]): PriceStep[] {
  const out: PriceStep[] = [];
  amounts.forEach((cents, i) => {
    const last = out[out.length - 1];
    if (last && last.cents === cents) {
      last.count++;
      last.to = i;
    } else out.push({ cents, count: 1, from: i, to: i });
  });
  return out;
}

/** Step height in dp: 96 for a steady price, else 52–118 by price. */
export function stepHeight(cents: number, min: number, max: number): number {
  return max === min ? 96 : 52 + ((cents - min) / (max - min)) * 66;
}
