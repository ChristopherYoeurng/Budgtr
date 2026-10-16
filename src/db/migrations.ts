/**
 * Versioned, idempotent SQLite migrations.
 *
 * The runner records applied versions in `_migrations`. Each migration is a
 * list of SQL statements executed in order inside a single transaction.
 */
import type { Database } from './types';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

/** Default category seed covering common personal-finance buckets. */
export const SEED_CATEGORIES: Array<{ name: string; parent: string | null }> = [
  { name: 'Income', parent: null },
  { name: 'Transfer', parent: null },
  { name: 'Food & Dining', parent: null },
  { name: 'Groceries', parent: 'Food & Dining' },
  { name: 'Restaurants', parent: 'Food & Dining' },
  { name: 'Shopping', parent: null },
  { name: 'Housing', parent: null },
  { name: 'Rent', parent: 'Housing' },
  { name: 'Utilities', parent: 'Housing' },
  { name: 'Transportation', parent: null },
  { name: 'Gas', parent: 'Transportation' },
  { name: 'Travel', parent: null },
  { name: 'Health', parent: null },
  { name: 'Entertainment', parent: null },
  { name: 'Subscriptions', parent: null },
  { name: 'Fees & Charges', parent: null },
  { name: 'Uncategorized', parent: null },
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS items (
        item_id TEXT PRIMARY KEY NOT NULL,
        access_token TEXT NOT NULL,
        institution_name TEXT NOT NULL,
        sync_cursor TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS accounts (
        account_id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        official_name TEXT,
        mask TEXT,
        type TEXT NOT NULL,
        subtype TEXT,
        current_balance REAL NOT NULL DEFAULT 0,
        available_balance REAL,
        iso_currency TEXT NOT NULL DEFAULT 'USD',
        FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS categories (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent TEXT,
        is_custom INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        merchant_name TEXT,
        amount REAL NOT NULL,
        pending INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        iso_currency TEXT NOT NULL DEFAULT 'USD',
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL
      );`,
      `CREATE TABLE IF NOT EXISTS budgets (
        budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        limit_amount REAL NOT NULL,
        UNIQUE (category_id, month),
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);`,
      `CREATE INDEX IF NOT EXISTS idx_accounts_item ON accounts(item_id);`,
      `CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);`,
    ],
  },
  {
    version: 2,
    name: 'recurring_streams',
    statements: [
      `CREATE TABLE IF NOT EXISTS recurring_streams (
        stream_id TEXT PRIMARY KEY NOT NULL,
        description TEXT NOT NULL,
        merchant_name TEXT,
        direction TEXT NOT NULL,
        frequency TEXT NOT NULL,
        last_amount REAL NOT NULL,
        average_amount REAL NOT NULL,
        last_date TEXT NOT NULL,
        next_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_streams(next_date);`,
    ],
  },
  {
    version: 3,
    name: 'net_worth_snapshots',
    statements: [
      `CREATE TABLE IF NOT EXISTS net_worth_snapshots (
        date TEXT PRIMARY KEY NOT NULL,
        net_worth REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_nws_date ON net_worth_snapshots(date);`,
    ],
  },
];

/**
 * Apply all pending migrations. Safe to call on every launch (idempotent).
 */
export function runMigrations(db: Database): void {
  db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  );

  const applied = new Set(
    db
      .execute<{ version: number }>(`SELECT version FROM _migrations;`)
      .rows.map(r => r.version),
  );

  const pending = MIGRATIONS.filter(m => !applied.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    db.transaction(() => {
      for (const sql of migration.statements) {
        db.execute(sql);
      }
      db.execute(`INSERT INTO _migrations (version, name) VALUES (?, ?);`, [
        migration.version,
        migration.name,
      ]);
    });
  }

  seedCategories(db);
}

/** Insert the default categories if they are not already present. */
export function seedCategories(db: Database): void {
  db.transaction(() => {
    for (const cat of SEED_CATEGORIES) {
      db.execute(
        `INSERT OR IGNORE INTO categories (name, parent, is_custom)
         VALUES (?, ?, 0);`,
        [cat.name, cat.parent],
      );
    }
  });
}
