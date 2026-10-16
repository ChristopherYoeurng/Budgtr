/**
 * Formatting helpers for currency, dates, and months.
 * Kept dependency-free and pure so they are trivially unit-testable.
 */

/** Format a numeric amount as USD currency, e.g. 1234.5 -> "$1,234.50". */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${sign}${formatted}`;
}

/** Return the current month key in YYYY-MM form. */
export function currentMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}

/** Convert a YYYY-MM-DD or ISO date string to a YYYY-MM month key. */
export function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Human-friendly month label, e.g. "2026-01" -> "January 2026". */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Shift a YYYY-MM month key by a number of months (can be negative). */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1 + delta, 1);
  return currentMonthKey(date);
}
