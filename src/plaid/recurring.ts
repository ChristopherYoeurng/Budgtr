/**
 * Recurring transaction detection.
 *
 * Primary source: Plaid's /transactions/recurring/get streams. Fallback:
 * a local heuristic over stored transactions that groups by merchant/name and
 * infers a cadence from the gaps between dates.
 */
import type {
  RecurringFrequency,
  RecurringStream,
  Transaction,
} from '../types/models';
import type { PlaidRecurringStream } from './client';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(d: string): number {
  return new Date(`${d}T00:00:00Z`).getTime();
}

function addDays(d: string, days: number): string {
  return new Date(parseDate(d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Approximate day interval for a frequency, used to estimate the next date. */
function frequencyDays(freq: RecurringFrequency): number | null {
  switch (freq) {
    case 'WEEKLY':
      return 7;
    case 'BIWEEKLY':
      return 14;
    case 'SEMI_MONTHLY':
      return 15;
    case 'MONTHLY':
      return 30;
    case 'ANNUALLY':
      return 365;
    default:
      return null;
  }
}

/** Estimate the next occurrence date from a frequency + last date. */
export function estimateNextDate(
  lastDate: string,
  freq: RecurringFrequency,
): string | null {
  const days = frequencyDays(freq);
  return days == null ? null : addDays(lastDate, days);
}

function normalizeFrequency(raw: string): RecurringFrequency {
  const f = raw?.toUpperCase?.() ?? '';
  if (
    f === 'WEEKLY' ||
    f === 'BIWEEKLY' ||
    f === 'SEMI_MONTHLY' ||
    f === 'MONTHLY' ||
    f === 'ANNUALLY'
  ) {
    return f;
  }
  return 'UNKNOWN';
}

/** Map a Plaid recurring stream to our RecurringStream shape. */
export function mapPlaidStream(
  s: PlaidRecurringStream,
  direction: 'inflow' | 'outflow',
): RecurringStream {
  const frequency = normalizeFrequency(s.frequency);
  return {
    streamId: s.stream_id,
    description: s.description,
    merchantName: s.merchant_name ?? null,
    direction,
    frequency,
    lastAmount: Math.abs(s.last_amount?.amount ?? 0),
    averageAmount: Math.abs(s.average_amount?.amount ?? 0),
    lastDate: s.last_date,
    nextDate: s.is_active ? estimateNextDate(s.last_date, frequency) : null,
    isActive: s.is_active,
    source: 'plaid',
  };
}

export function mapPlaidRecurring(resp: {
  inflow_streams: PlaidRecurringStream[];
  outflow_streams: PlaidRecurringStream[];
}): RecurringStream[] {
  return [
    ...resp.inflow_streams.map(s => mapPlaidStream(s, 'inflow')),
    ...resp.outflow_streams.map(s => mapPlaidStream(s, 'outflow')),
  ];
}

/** Normalize a merchant/name for grouping (lowercase, strip digits/punct). */
function groupKey(t: Transaction): string {
  const base = (t.merchantName ?? t.name ?? '').toLowerCase();
  return base.replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();
}

function medianGap(sortedDates: number[]): number | null {
  if (sortedDates.length < 2) {
    return null;
  }
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push((sortedDates[i] - sortedDates[i - 1]) / DAY_MS);
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

function frequencyFromGap(days: number): RecurringFrequency {
  if (days >= 5 && days <= 9) {
    return 'WEEKLY';
  }
  if (days >= 12 && days <= 16) {
    return 'BIWEEKLY';
  }
  if (days >= 26 && days <= 35) {
    return 'MONTHLY';
  }
  if (days >= 350 && days <= 380) {
    return 'ANNUALLY';
  }
  return 'UNKNOWN';
}

/**
 * Local heuristic: group non-pending transactions by normalized merchant and
 * flag groups with >=3 occurrences, a regular cadence, and stable amounts.
 */
export function detectRecurringHeuristic(
  transactions: Transaction[],
): RecurringStream[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.pending) {
      continue;
    }
    const key = groupKey(t);
    if (!key) {
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const streams: RecurringStream[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) {
      continue;
    }
    const sorted = [...list].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const dates = sorted.map(t => parseDate(t.date));
    const gap = medianGap(dates);
    if (gap == null) {
      continue;
    }
    const freq = frequencyFromGap(gap);
    if (freq === 'UNKNOWN') {
      continue;
    }
    // Amount stability: coefficient of variation < 15%.
    const amounts = sorted.map(t => Math.abs(t.amount));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance =
      amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const cv = mean === 0 ? 1 : Math.sqrt(variance) / mean;
    if (cv > 0.15) {
      continue;
    }

    const last = sorted[sorted.length - 1];
    const direction = last.amount >= 0 ? 'outflow' : 'inflow';
    streams.push({
      streamId: `heuristic:${key}`,
      description: last.merchantName ?? last.name,
      merchantName: last.merchantName ?? null,
      direction,
      frequency: freq,
      lastAmount: Math.abs(last.amount),
      averageAmount: Math.round(mean * 100) / 100,
      lastDate: last.date,
      nextDate: estimateNextDate(last.date, freq),
      isActive: true,
      source: 'heuristic',
    });
  }

  return streams.sort((a, b) => b.averageAmount - a.averageAmount);
}
