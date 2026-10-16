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
  Transaction,
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
         current_balance, available_balance, iso_currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         name = excluded.name,
         official_name = excluded.official_name,
         mask = excluded.mask,
         type = excluded.type,
         subtype = excluded.subtype,
         current_balance = excluded.current_balance,
         available_balance = excluded.available_balance,
         iso_currency = excluded.iso_currency;`,
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
      ],
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
    };
  },

  /** Net worth: assets (depository/investment) minus liabilities (credit/loan). */
  netWorth(db: Database): number {
    const row = db.execute<{ net: number }>(
      `SELECT COALESCE(SUM(
         CASE WHEN type IN ('credit','loan') THEN -current_balance
              ELSE current_balance END), 0) AS net
       FROM accounts;`,
    ).rows[0];
    return toNum(row?.net);
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

  /** Paginated feed, newest first, optional text search over name/merchant. */
  list(
    db: Database,
    opts: { limit?: number; offset?: number; search?: string } = {},
  ): Transaction[] {
    const { limit = 50, offset = 0, search } = opts;
    const params: unknown[] = [];
    let where = '';
    if (search && search.trim()) {
      where = `WHERE name LIKE ? OR merchant_name LIKE ?`;
      const like = `%${search.trim()}%`;
      params.push(like, like);
    }
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
