/**
 * Production database handle backed by @op-engineering/op-sqlite.
 *
 * Wraps op-sqlite's connection into the small `Database` interface the
 * repositories use, enabling WAL mode and foreign keys, and running migrations.
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from './types';
import { runMigrations } from './migrations';

const DB_NAME = 'budget.db';

let singleton: Database | null = null;

/** Adapt an op-sqlite connection to our Database interface. */
function adapt(conn: {
  execute: (sql: string, params?: unknown[]) => { rows?: unknown; rowsAffected?: number; insertId?: number };
  executeBatch?: (stmts: Array<{ sql: string; params?: unknown[] }>) => void;
  transaction?: (fn: (tx: unknown) => unknown) => unknown;
  close: () => void;
}): Database {
  const execute = <Row = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): QueryResult<Row> => {
    const res = conn.execute(sql, params);
    // op-sqlite returns rows as an array-like; normalize to Row[].
    const rawRows = (res.rows as { _array?: Row[] } | Row[] | undefined) ?? [];
    const rows: Row[] = Array.isArray(rawRows)
      ? (rawRows as Row[])
      : ((rawRows as { _array?: Row[] })._array ?? []);
    return {
      rows,
      rowsAffected: res.rowsAffected ?? 0,
      insertId: res.insertId,
    };
  };

  const executeBatch = (
    statements: Array<{ sql: string; params?: unknown[] }>,
  ): void => {
    for (const s of statements) {
      execute(s.sql, s.params ?? []);
    }
  };

  const transaction = <T>(fn: () => T): T => {
    execute('BEGIN;');
    try {
      const result = fn();
      execute('COMMIT;');
      return result;
    } catch (e) {
      execute('ROLLBACK;');
      throw e;
    }
  };

  return { execute, executeBatch, transaction, close: () => conn.close() };
}

/** Open (or reuse) the app database, enabling WAL + FKs and running migrations. */
export function getDatabase(): Database {
  if (singleton) {
    return singleton;
  }
  const conn = open({ name: DB_NAME });
  const db = adapt(conn as never);
  db.execute('PRAGMA journal_mode = WAL;');
  db.execute('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  singleton = db;
  return db;
}

/** Reset the singleton (used by tests). */
export function _resetDatabaseSingleton(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
