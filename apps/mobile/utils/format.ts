/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount: number, showCents = true): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return formatter.format(amount);
}

/**
 * Format a number as compact currency (e.g., $1.2K)
 */
export function formatCompactCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return formatCurrency(amount, false);
}

/**
 * A money amount for a tight slot (a calendar day cell, ~35px wide), short
 * at every size; the sign is the caller's.
 *   $85.44 · $326 · $1.3k · $13k · $130k · $1.3M
 * Cents only under $100; whole dollars to $999; then k / M with one decimal
 * below 10, none from 10 up. A rounding that reaches the next unit moves up
 * ($999.60 → $1k, not $1000; $999,999 → $1M, not $1000k).
 */
export function formatCompactCents(cents: number): string {
  const c = Math.abs(Math.round(Number.isFinite(cents) ? cents : 0));
  if (c < 10000) return `$${(c / 100).toFixed(2)}`;
  const dollars = Math.round(c / 100);
  if (dollars < 1000) return `$${dollars}`;
  const fmt = (v: number) => (v < 9.95 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
  const k = dollars / 1000;
  if (Math.round(k) < 1000) return `$${fmt(k)}k`;
  return `$${fmt(dollars / 1e6)}M`;
}

/**
 * Format a percentage (0-100)
 */
export function formatPercentage(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date for display
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date as short (e.g., "Jan 15")
 */
export function formatDateShort(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculate progress percentage (0-100)
 */
export function calculateProgress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
