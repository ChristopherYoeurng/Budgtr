/**
 * Repository layer: typed CRUD plus the aggregation queries used by the
 * Budgets and Insights screens. All functions take a `Database` so they are
 * trivially testable against the op-sqlite mock (real node:sqlite).
 */
import type { Database } from './types';
import type {
  Account,
  Budget,
  BudgetProgress,
  Category,
  CategorySpend,
  Item,
  MonthSpend,
  NetWorthPoint,
  RecurringStream,
  Transaction,
  WidgetPref,
} from '../types/models';

const toBool = (v: unknown): boolean => v === 1 || v === true;
const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export const ItemsRepo = {
  upsert(db: Database, item: Item): void {
    db.execute(
      `INSERT INTO items (item_id, access_token, institution_name, sync_cursor)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         access_token = excluded.access_token,
         institution_name = excluded.institution_name;`,
      [item.itemId, item.accessToken, item.institutionName, item.syncCursor],
    );
  },

  all(db: Database): Item[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT * FROM items ORDER BY created_at ASC;`,
      )
      .rows.map(r => ({
        itemId: String(r.item_id),
        accessToken: String(r.access_token),
        institutionName: String(r.institution_name),
        syncCursor: r.sync_cursor == null ? null : String(r.sync_cursor),
        createdAt: String(r.created_at),
      }));
  },

  setCursor(db: Database, itemId: string, cursor: string): void {
    db.execute(`UPDATE items SET sync_cursor = ? WHERE item_id = ?;`, [
      cursor,
      itemId,
    ]);
  },

  getCursor(db: Database, itemId: string): string | null {
    const row = db.execute<{ sync_cursor: string | null }>(
      `SELECT sync_cursor FROM items WHERE item_id = ?;`,
      [itemId],
    ).rows[0];
    return row ? row.sync_cursor : null;
  },
};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const AccountsRepo = {
  upsert(db: Database, a: Account): void {
    db.execute(
      `INSERT INTO accounts
        (account_id, item_id, name, official_name, mask, type, subtype,
         current_balance, available_balance, iso_currency, include_in_net_worth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         name = excluded.name,
         official_name = excluded.official_name,
         mask = excluded.mask,
         type = excluded.type,
         subtype = excluded.subtype,
         current_balance = excluded.current_balance,
         available_balance = excluded.available_balance,
         iso_currency = excluded.iso_currency;`,
      // NOTE: include_in_net_worth is intentionally NOT in the UPDATE set, so a
      // re-sync never clobbers the user's exclude choice.
      [
        a.accountId,
        a.itemId,
        a.name,
        a.officialName,
        a.mask,
        a.type,
        a.subtype,
        a.currentBalance,
        a.availableBalance,
        a.isoCurrency,
        a.includeInNetWorth === false ? 0 : 1,
      ],
    );
  },

  /** Permanently delete an account (and its transactions via FK cascade). */
  remove(db: Database, accountId: string): void {
    db.execute(`DELETE FROM accounts WHERE account_id = ?;`, [accountId]);
  },

  /** Toggle whether an account counts toward net worth. */
  setIncludeInNetWorth(
    db: Database,
    accountId: string,
    include: boolean,
  ): void {
    db.execute(
      `UPDATE accounts SET include_in_net_worth = ? WHERE account_id = ?;`,
      [include ? 1 : 0, accountId],
    );
  },

  all(db: Database): Account[] {
    return db
      .execute<Record<string, unknown>>(`SELECT * FROM accounts;`)
      .rows.map(AccountsRepo._map);
  },

  _map(r: Record<string, unknown>): Account {
    return {
      accountId: String(r.account_id),
      itemId: String(r.item_id),
      name: String(r.name),
      officialName: r.official_name == null ? null : String(r.official_name),
      mask: r.mask == null ? null : String(r.mask),
      type: String(r.type) as Account['type'],
      subtype: r.subtype == null ? null : String(r.subtype),
      currentBalance: toNum(r.current_balance),
      availableBalance:
        r.available_balance == null ? null : toNum(r.available_balance),
      isoCurrency: String(r.iso_currency),
      includeInNetWorth: r.include_in_net_worth == null
        ? true
        : toBool(r.include_in_net_worth),
    };
  },

  /**
   * Net worth = assets (depository/investment/other) minus liabilities
   * (credit/loan), counting only accounts with include_in_net_worth = 1.
   */
  netWorth(db: Database): number {
    const row = db.execute<{ net: number }>(
      `SELECT COALESCE(SUM(
         CASE WHEN type IN ('credit','loan') THEN -current_balance
              ELSE current_balance END), 0) AS net
       FROM accounts
       WHERE include_in_net_worth = 1;`,
    ).rows[0];
    return toNum(row?.net);
  },
};

// ---------------------------------------------------------------------------
// Net worth history (daily snapshots)
// ---------------------------------------------------------------------------
export const NetWorthRepo = {
  /** Record (or overwrite) today's net-worth snapshot. One row per day. */
  snapshot(db: Database, netWorth: number, date?: string): void {
    const day = date ?? new Date().toISOString().slice(0, 10);
    db.execute(
      `INSERT INTO net_worth_snapshots (date, net_worth)
       VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET net_worth = excluded.net_worth;`,
      [day, netWorth],
    );
  },

  /** Snapshots on/after `sinceDate` (YYYY-MM-DD), oldest first. */
  since(db: Database, sinceDate: string): NetWorthPoint[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT date, net_worth FROM net_worth_snapshots
         WHERE date >= ?
         ORDER BY date ASC;`,
        [sinceDate],
      )
      .rows.map(r => ({ date: String(r.date), netWorth: toNum(r.net_worth) }));
  },

  /** All snapshots, oldest first. */
  all(db: Database): NetWorthPoint[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT date, net_worth FROM net_worth_snapshots ORDER BY date ASC;`,
      )
      .rows.map(r => ({ date: String(r.date), netWorth: toNum(r.net_worth) }));
  },

  /** Remove all snapshots (used before a full rebuild after account changes). */
  clearSnapshots(db: Database): void {
    db.execute(`DELETE FROM net_worth_snapshots;`);
  },

  /**
   * Reconstruct a historical assets−liabilities snapshot per day and persist as
   * daily snapshots.
   *
   * Net worth splits into two parts:
   *   • BASELINE — accounts with no transaction feed (investment / other) plus
   *     the net of all included accounts' CURRENT balances that we can't vary
   *     historically. We hold these constant across history (Plaid gives no
   *     historical balances for them).
   *   • TXN-BACKED — depository / credit / loan accounts have a transaction
   *     feed, so we reconstruct their net balance backward from today using
   *     transaction flows.
   *
   * For a day D:
   *   netWorth(D) = baseline + txnNetToday + Σ(signedEffect) for tx AFTER D
   * where signedEffect reverses a transaction's effect on net worth
   * (spend/amount>0 lowered NW, so adding it back raises the past value).
   *
   * Only accounts with include_in_net_worth = 1 participate. Real snapshots are
   * preserved (INSERT OR IGNORE).
   */
  reconstructHistory(db: Database, _currentNetWorth?: number): number {
    // Baseline = net of all included accounts (full current assets−liabilities).
    const baseline = db.execute<{ net: number }>(
      `SELECT COALESCE(SUM(
         CASE WHEN type IN ('credit','loan') THEN -current_balance
              ELSE current_balance END), 0) AS net
       FROM accounts
       WHERE include_in_net_worth = 1;`,
    ).rows[0];
    const currentNetWorth = toNum(baseline?.net);

    // Reconstruct using only transactions belonging to INCLUDED accounts.
    // netWorth-effect of a txn = -amount for an asset acct, +amount for a
    // liability acct (spending on a card raises the liability, lowering NW —
    // same sign as -amount since amount>0). So effect is uniformly -amount.
    const rows = db.execute<{ date: string; networth: number }>(
      `WITH daily AS (
         SELECT t.date AS date, SUM(t.amount) AS day_amount
         FROM transactions t
         JOIN accounts a ON a.account_id = t.account_id
         WHERE t.pending = 0 AND a.include_in_net_worth = 1
         GROUP BY t.date
       ),
       rev AS (
         SELECT date,
           COALESCE(SUM(day_amount) OVER (
             ORDER BY date DESC
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS sum_after
         FROM daily
       )
       SELECT date, (? + sum_after) AS networth
       FROM rev
       ORDER BY date ASC;`,
      [currentNetWorth],
    ).rows;

    db.transaction(() => {
      for (const r of rows) {
        db.execute(
          `INSERT OR IGNORE INTO net_worth_snapshots (date, net_worth)
           VALUES (?, ?);`,
          [String(r.date), toNum(r.networth)],
        );
      }
    });
    return rows.length;
  },
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const CategoriesRepo = {
  all(db: Database): Category[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT * FROM categories ORDER BY name;`,
      )
      .rows.map(r => ({
        categoryId: toNum(r.category_id),
        name: String(r.name),
        parent: r.parent == null ? null : String(r.parent),
        isCustom: toBool(r.is_custom),
      }));
  },

  create(db: Database, name: string, parent: string | null = null): number {
    const res = db.execute(
      `INSERT INTO categories (name, parent, is_custom) VALUES (?, ?, 1);`,
      [name, parent],
    );
    return toNum(res.insertId);
  },

  findByName(db: Database, name: string): Category | null {
    const r = db.execute<Record<string, unknown>>(
      `SELECT * FROM categories WHERE name = ?;`,
      [name],
    ).rows[0];
    if (!r) {
      return null;
    }
    return {
      categoryId: toNum(r.category_id),
      name: String(r.name),
      parent: r.parent == null ? null : String(r.parent),
      isCustom: toBool(r.is_custom),
    };
  },
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Extensible transaction filter. Add new optional keys here (e.g. accountIds,
 * minAmount, pendingOnly) and a matching clause in TransactionsRepo.list —
 * callers that don't set a key are unaffected.
 */
export interface TransactionFilter {
  /** Category ids to include (OR). Use -1 for the "Uncategorized" bucket. */
  categoryIds?: number[];
  /** Inclusive start date, YYYY-MM-DD. */
  startDate?: string;
  /** Inclusive end date, YYYY-MM-DD. */
  endDate?: string;
}

export interface TransactionListOptions {
  limit?: number;
  offset?: number;
  search?: string;
  filter?: TransactionFilter;
}

export const TransactionsRepo = {
  upsert(db: Database, t: Transaction): void {
    db.execute(
      `INSERT INTO transactions
        (transaction_id, account_id, date, name, merchant_name, amount,
         pending, category_id, iso_currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transaction_id) DO UPDATE SET
         account_id = excluded.account_id,
         date = excluded.date,
         name = excluded.name,
         merchant_name = excluded.merchant_name,
         amount = excluded.amount,
         pending = excluded.pending,
         category_id = excluded.category_id,
         iso_currency = excluded.iso_currency;`,
      [
        t.transactionId,
        t.accountId,
        t.date,
        t.name,
        t.merchantName,
        t.amount,
        t.pending ? 1 : 0,
        t.categoryId,
        t.isoCurrency,
      ],
    );
  },

  remove(db: Database, transactionId: string): void {
    db.execute(`DELETE FROM transactions WHERE transaction_id = ?;`, [
      transactionId,
    ]);
  },

  setCategory(
    db: Database,
    transactionId: string,
    categoryId: number | null,
  ): void {
    db.execute(`UPDATE transactions SET category_id = ? WHERE transaction_id = ?;`, [
      categoryId,
      transactionId,
    ]);
  },

  _map(r: Record<string, unknown>): Transaction {
    return {
      transactionId: String(r.transaction_id),
      accountId: String(r.account_id),
      date: String(r.date),
      name: String(r.name),
      merchantName: r.merchant_name == null ? null : String(r.merchant_name),
      amount: toNum(r.amount),
      pending: toBool(r.pending),
      categoryId: r.category_id == null ? null : toNum(r.category_id),
      isoCurrency: String(r.iso_currency),
    };
  },

  /**
   * Paginated feed, newest first. Supports an extensible set of filters —
   * add new keys to `TransactionFilter` + a clause here without touching callers.
   * Current filters: text `search`, `categoryIds` (OR within), `startDate` /
   * `endDate` (inclusive, YYYY-MM-DD).
   */
  list(db: Database, opts: TransactionListOptions = {}): Transaction[] {
    const { limit = 50, offset = 0, search, filter = {} } = opts;
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (search && search.trim()) {
      clauses.push(`(name LIKE ? OR merchant_name LIKE ?)`);
      const like = `%${search.trim()}%`;
      params.push(like, like);
    }

    if (filter.categoryIds && filter.categoryIds.length > 0) {
      // Supports the "Uncategorized" bucket via a null sentinel (-1).
      const hasUncat = filter.categoryIds.includes(-1);
      const realIds = filter.categoryIds.filter(id => id !== -1);
      const parts: string[] = [];
      if (realIds.length > 0) {
        parts.push(`category_id IN (${realIds.map(() => '?').join(', ')})`);
        params.push(...realIds);
      }
      if (hasUncat) {
        parts.push(`category_id IS NULL`);
      }
      if (parts.length > 0) {
        clauses.push(`(${parts.join(' OR ')})`);
      }
    }

    if (filter.startDate) {
      clauses.push(`date >= ?`);
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      clauses.push(`date <= ?`);
      params.push(filter.endDate);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit, offset);
    return db
      .execute<Record<string, unknown>>(
        `SELECT * FROM transactions ${where}
         ORDER BY date DESC, transaction_id DESC
         LIMIT ? OFFSET ?;`,
        params,
      )
      .rows.map(TransactionsRepo._map);
  },
};

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const BudgetsRepo = {
  /** Create or update the limit for a category in a given month. */
  setLimit(
    db: Database,
    categoryId: number,
    month: string,
    limitAmount: number,
  ): void {
    db.execute(
      `INSERT INTO budgets (category_id, month, limit_amount)
       VALUES (?, ?, ?)
       ON CONFLICT(category_id, month) DO UPDATE SET
         limit_amount = excluded.limit_amount;`,
      [categoryId, month, limitAmount],
    );
  },

  forMonth(db: Database, month: string): Budget[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT * FROM budgets WHERE month = ?;`,
        [month],
      )
      .rows.map(r => ({
        budgetId: toNum(r.budget_id),
        categoryId: toNum(r.category_id),
        month: String(r.month),
        limitAmount: toNum(r.limit_amount),
      }));
  },
};

// ---------------------------------------------------------------------------
// Recurring streams (bills / recurring income)
// ---------------------------------------------------------------------------
export const RecurringRepo = {
  upsert(db: Database, s: RecurringStream): void {
    db.execute(
      `INSERT INTO recurring_streams
        (stream_id, description, merchant_name, direction, frequency,
         last_amount, average_amount, last_date, next_date, is_active, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stream_id) DO UPDATE SET
         description = excluded.description,
         merchant_name = excluded.merchant_name,
         direction = excluded.direction,
         frequency = excluded.frequency,
         last_amount = excluded.last_amount,
         average_amount = excluded.average_amount,
         last_date = excluded.last_date,
         next_date = excluded.next_date,
         is_active = excluded.is_active,
         source = excluded.source;`,
      [
        s.streamId,
        s.description,
        s.merchantName,
        s.direction,
        s.frequency,
        s.lastAmount,
        s.averageAmount,
        s.lastDate,
        s.nextDate,
        s.isActive ? 1 : 0,
        s.source,
      ],
    );
  },

  replaceAll(db: Database, streams: RecurringStream[]): void {
    db.transaction(() => {
      db.execute(`DELETE FROM recurring_streams;`);
      for (const s of streams) {
        RecurringRepo.upsert(db, s);
      }
    });
  },

  all(db: Database): RecurringStream[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT * FROM recurring_streams
         WHERE is_active = 1
         ORDER BY direction DESC, average_amount DESC;`,
      )
      .rows.map(r => ({
        streamId: String(r.stream_id),
        description: String(r.description),
        merchantName: r.merchant_name == null ? null : String(r.merchant_name),
        direction: String(r.direction) as RecurringStream['direction'],
        frequency: String(r.frequency) as RecurringStream['frequency'],
        lastAmount: toNum(r.last_amount),
        averageAmount: toNum(r.average_amount),
        lastDate: String(r.last_date),
        nextDate: r.next_date == null ? null : String(r.next_date),
        isActive: toBool(r.is_active),
        source: String(r.source) as RecurringStream['source'],
      }));
  },
};

// ---------------------------------------------------------------------------
// Aggregations (drive charts + budget progress)
// ---------------------------------------------------------------------------

/**
 * Total spend per category for a month. Spend = positive amounts (money out),
 * excluding pending and the Income/Transfer categories.
 */
export function spendByCategory(db: Database, month: string): CategorySpend[] {
  return db
    .execute<Record<string, unknown>>(
      `SELECT t.category_id AS category_id,
              COALESCE(c.name, 'Uncategorized') AS category_name,
              SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.category_id = t.category_id
       WHERE substr(t.date, 1, 7) = ?
         AND t.pending = 0
         AND t.amount > 0
         AND COALESCE(c.name, '') NOT IN ('Income', 'Transfer')
       GROUP BY t.category_id
       ORDER BY total DESC;`,
      [month],
    )
    .rows.map(r => ({
      categoryId: r.category_id == null ? null : toNum(r.category_id),
      categoryName: String(r.category_name),
      total: toNum(r.total),
    }));
}

/** Total spend per month across the last N months (inclusive of current). */
export function spendByMonth(db: Database, monthsBack: number = 6): MonthSpend[] {
  return db
    .execute<Record<string, unknown>>(
      `SELECT substr(t.date, 1, 7) AS month, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.category_id = t.category_id
       WHERE t.pending = 0 AND t.amount > 0
         AND COALESCE(c.name, '') NOT IN ('Income', 'Transfer')
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?;`,
      [monthsBack],
    )
    .rows.map(r => ({ month: String(r.month), total: toNum(r.total) }))
    .reverse();
}

/** Budget-vs-actual progress for every budget set in a month. */
export function budgetProgress(db: Database, month: string): BudgetProgress[] {
  return db
    .execute<Record<string, unknown>>(
      `SELECT b.budget_id, b.category_id, c.name AS category_name,
              b.month, b.limit_amount,
              COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.category_id = b.category_id
                  AND substr(t.date, 1, 7) = b.month
                  AND t.pending = 0
                  AND t.amount > 0
              ), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.category_id = b.category_id
       WHERE b.month = ?
       ORDER BY c.name;`,
      [month],
    )
    .rows.map(r => {
      const limitAmount = toNum(r.limit_amount);
      const spent = toNum(r.spent);
      return {
        budgetId: toNum(r.budget_id),
        categoryId: toNum(r.category_id),
        categoryName: String(r.category_name),
        month: String(r.month),
        limitAmount,
        spent,
        remaining: limitAmount - spent,
        overBudget: spent > limitAmount,
      };
    });
}

// ---------------------------------------------------------------------------
// Month comparison
// ---------------------------------------------------------------------------

/** Total spend (money out, non-pending, excl. Income/Transfer) for one month. */
export function spendTotalForMonth(db: Database, month: string): number {
  const row = db.execute<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.category_id = t.category_id
     WHERE substr(t.date, 1, 7) = ?
       AND t.pending = 0
       AND t.amount > 0
       AND COALESCE(c.name, '') NOT IN ('Income', 'Transfer');`,
    [month],
  ).rows[0];
  return toNum(row?.total);
}

/** Distinct YYYY-MM months that have transactions, newest first. */
export function availableMonths(db: Database): string[] {
  return db
    .execute<{ month: string }>(
      `SELECT DISTINCT substr(date, 1, 7) AS month
       FROM transactions
       WHERE pending = 0
       ORDER BY month DESC;`,
    )
    .rows.map(r => String(r.month));
}

/**
 * Per-category spend for two months, aligned for comparison. Returns one row
 * per category present in either month, with both totals.
 */
export interface CategoryComparison {
  categoryName: string;
  current: number;
  other: number;
}

export function spendComparison(
  db: Database,
  currentMonth: string,
  otherMonth: string,
): CategoryComparison[] {
  const cur = new Map(
    spendByCategory(db, currentMonth).map(c => [c.categoryName, c.total]),
  );
  const oth = new Map(
    spendByCategory(db, otherMonth).map(c => [c.categoryName, c.total]),
  );
  const names = new Set<string>([...cur.keys(), ...oth.keys()]);
  return [...names]
    .map(name => ({
      categoryName: name,
      current: cur.get(name) ?? 0,
      other: oth.get(name) ?? 0,
    }))
    .sort((a, b) => b.current + b.other - (a.current + a.other));
}

/** A running-total point for a day within a month. */
export interface CumulativePoint {
  day: number; // day-of-month (1..31)
  cumulative: number; // running total spend through this day
}

/**
 * Cumulative (running-total) spend by day-of-month for the given month,
 * restricted to the given category names. Used by the line comparison widget
 * to show how spend accrues over a month. Excludes pending, money-in, and the
 * Income/Transfer categories. If `categoryNames` is empty, returns [].
 *
 * 'Uncategorized' matches transactions with no category_id.
 */
export function cumulativeSpendByDay(
  db: Database,
  month: string,
  categoryNames: string[],
): CumulativePoint[] {
  if (categoryNames.length === 0) {
    return [];
  }
  const includeUncategorized = categoryNames.includes('Uncategorized');
  const named = categoryNames.filter(n => n !== 'Uncategorized');

  // Build the category filter: named ids via a join on name, plus optional NULL.
  const clauses: string[] = [];
  const params: unknown[] = [month];
  if (named.length > 0) {
    const placeholders = named.map(() => '?').join(', ');
    clauses.push(`c.name IN (${placeholders})`);
    params.push(...named);
  }
  if (includeUncategorized) {
    clauses.push(`t.category_id IS NULL`);
  }
  const categoryFilter = `(${clauses.join(' OR ')})`;

  return db
    .execute<Record<string, unknown>>(
      `WITH days AS (
         SELECT CAST(substr(t.date, 9, 2) AS INTEGER) AS day,
                SUM(t.amount) AS day_total
         FROM transactions t
         LEFT JOIN categories c ON c.category_id = t.category_id
         WHERE substr(t.date, 1, 7) = ?
           AND t.pending = 0
           AND t.amount > 0
           AND COALESCE(c.name, '') NOT IN ('Income', 'Transfer')
           AND ${categoryFilter}
         GROUP BY day
       )
       SELECT day,
              SUM(day_total) OVER (
                ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS cumulative
       FROM days
       ORDER BY day ASC;`,
      params,
    )
    .rows.map(r => ({ day: toNum(r.day), cumulative: toNum(r.cumulative) }));
}

// ---------------------------------------------------------------------------
// Insights widget layout preferences
// ---------------------------------------------------------------------------
export const WidgetPrefsRepo = {
  all(db: Database): WidgetPref[] {
    return db
      .execute<Record<string, unknown>>(
        `SELECT widget_id, position, visible FROM widget_prefs
         ORDER BY position ASC;`,
      )
      .rows.map(r => ({
        widgetId: String(r.widget_id),
        position: toNum(r.position),
        visible: toBool(r.visible),
      }));
  },

  /** Persist the full ordered list (position derived from array index). */
  saveAll(db: Database, prefs: Array<{ widgetId: string; visible: boolean }>): void {
    db.transaction(() => {
      db.execute(`DELETE FROM widget_prefs;`);
      prefs.forEach((p, i) => {
        db.execute(
          `INSERT INTO widget_prefs (widget_id, position, visible)
           VALUES (?, ?, ?);`,
          [p.widgetId, i, p.visible ? 1 : 0],
        );
      });
    });
  },
};
