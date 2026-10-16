/**
 * Migration tests — run against the op-sqlite mock (real node:sqlite engine).
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from '../src/db/types';
import {
  runMigrations,
  SEED_CATEGORIES,
  MIGRATIONS,
} from '../src/db/migrations';

// Minimal adapter from the mock connection to our Database interface.
function makeDb(): Database {
  const conn = open({ name: 'test.db' }) as unknown as {
    execute: (sql: string, params?: unknown[]) => QueryResult;
    transaction: (fn: () => unknown) => unknown;
    close: () => void;
  };
  return {
    execute: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      conn.execute(sql, params) as QueryResult<Row>,
    executeBatch: stmts => stmts.forEach(s => conn.execute(s.sql, s.params)),
    transaction: fn => conn.transaction(fn) as never,
    close: () => conn.close(),
  };
}

describe('migrations', () => {
  it('creates all expected tables', () => {
    const db = makeDb();
    runMigrations(db);

    const tables = db
      .execute<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`,
      )
      .rows.map(r => r.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        '_migrations',
        'items',
        'accounts',
        'categories',
        'transactions',
        'budgets',
      ]),
    );
    db.close();
  });

  it('creates the expected indexes', () => {
    const db = makeDb();
    runMigrations(db);
    const indexes = db
      .execute<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';`,
      )
      .rows.map(r => r.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_tx_date',
        'idx_tx_account',
        'idx_tx_category',
        'idx_accounts_item',
        'idx_budgets_month',
      ]),
    );
    db.close();
  });

  it('seeds the default categories', () => {
    const db = makeDb();
    runMigrations(db);
    const count = db.execute<{ c: number }>(
      `SELECT COUNT(*) AS c FROM categories;`,
    ).rows[0].c;
    expect(count).toBe(SEED_CATEGORIES.length);
    db.close();
  });

  it('is idempotent when run twice (no duplicate migrations or categories)', () => {
    const db = makeDb();
    runMigrations(db);
    runMigrations(db);

    const migCount = db.execute<{ c: number }>(
      `SELECT COUNT(*) AS c FROM _migrations;`,
    ).rows[0].c;
    expect(migCount).toBe(MIGRATIONS.length);

    const catCount = db.execute<{ c: number }>(
      `SELECT COUNT(*) AS c FROM categories;`,
    ).rows[0].c;
    expect(catCount).toBe(SEED_CATEGORIES.length);
    db.close();
  });
});
