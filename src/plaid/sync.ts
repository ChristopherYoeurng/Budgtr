/**
 * Transaction sync engine.
 *
 * Uses Plaid's cursor-based /transactions/sync to pull incremental updates per
 * Item: applies `added`/`modified` (upsert) and `removed` (delete), maps Plaid
 * categories to local ones, and advances the stored cursor. Pending→posted
 * transitions are handled naturally (pending id arrives in `removed`, posted in
 * `added`).
 */
import type { Database } from '../db/types';
import {
  CategoriesRepo,
  ItemsRepo,
  RecurringRepo,
  TransactionsRepo,
} from '../db/repositories';
import type { PlaidClient, PlaidTransaction } from './client';
import { mapPlaidCategory } from './categoryMap';
import { detectRecurringHeuristic, mapPlaidRecurring } from './recurring';
import type { RecurringStream } from '../types/models';

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

/** Resolve (and cache) a local category id for a Plaid transaction. */
function categoryIdFor(
  db: Database,
  cache: Map<string, number>,
  txn: PlaidTransaction,
): number | null {
  const name = mapPlaidCategory(txn.personal_finance_category?.primary);
  if (cache.has(name)) {
    return cache.get(name)!;
  }
  const found = CategoriesRepo.findByName(db, name);
  const id = found ? found.categoryId : CategoriesRepo.create(db, name);
  cache.set(name, id);
  return id;
}

function upsertTxn(
  db: Database,
  cache: Map<string, number>,
  t: PlaidTransaction,
): void {
  TransactionsRepo.upsert(db, {
    transactionId: t.transaction_id,
    accountId: t.account_id,
    date: t.date,
    name: t.name,
    merchantName: t.merchant_name ?? null,
    amount: t.amount,
    pending: Boolean(t.pending),
    categoryId: categoryIdFor(db, cache, t),
    isoCurrency: t.iso_currency_code ?? 'USD',
  });
}

/**
 * Sync a single Item to completion (follows `has_more` pagination).
 * Advances the Item's cursor after each page is applied.
 */
export async function syncItem(
  db: Database,
  client: PlaidClient,
  itemId: string,
  accessToken: string,
): Promise<SyncResult> {
  const result: SyncResult = { added: 0, modified: 0, removed: 0 };
  const categoryCache = new Map<string, number>();

  let cursor = ItemsRepo.getCursor(db, itemId);
  let hasMore = true;

  while (hasMore) {
    const page = await client.transactionsSync(accessToken, cursor);

    db.transaction(() => {
      for (const t of page.added) {
        upsertTxn(db, categoryCache, t);
      }
      for (const t of page.modified) {
        upsertTxn(db, categoryCache, t);
      }
      for (const r of page.removed) {
        TransactionsRepo.remove(db, r.transaction_id);
      }
      ItemsRepo.setCursor(db, itemId, page.next_cursor);
    });

    result.added += page.added.length;
    result.modified += page.modified.length;
    result.removed += page.removed.length;

    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  return result;
}

/** Sync every linked Item sequentially. */
export async function syncAll(
  db: Database,
  client: PlaidClient,
): Promise<SyncResult> {
  const totals: SyncResult = { added: 0, modified: 0, removed: 0 };
  for (const item of ItemsRepo.all(db)) {
    const r = await syncItem(db, client, item.itemId, item.accessToken);
    totals.added += r.added;
    totals.modified += r.modified;
    totals.removed += r.removed;
  }
  return totals;
}

/**
 * Refresh recurring streams across all items.
 *
 * Tries Plaid's /transactions/recurring/get first; if it fails or returns
 * nothing (e.g. not enough history), falls back to the local heuristic over
 * stored transactions. Results replace the recurring_streams table.
 */
export async function syncRecurring(
  db: Database,
  client: PlaidClient,
): Promise<number> {
  const collected: RecurringStream[] = [];

  for (const item of ItemsRepo.all(db)) {
    try {
      const resp = await client.transactionsRecurringGet(item.accessToken);
      collected.push(...mapPlaidRecurring(resp));
    } catch {
      // Ignore per-item Plaid failures; heuristic fallback below covers it.
    }
  }

  if (collected.length === 0) {
    const txns = TransactionsRepo.list(db, { limit: 2000 });
    collected.push(...detectRecurringHeuristic(txns));
  }

  RecurringRepo.replaceAll(db, collected);
  return collected.length;
}
