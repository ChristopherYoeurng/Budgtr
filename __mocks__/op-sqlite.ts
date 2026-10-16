/**
 * Jest mock of @op-engineering/op-sqlite.
 *
 * Backs the op-sqlite API surface our app uses (`open`, returning an object
 * with `execute`, `executeBatch`, `transaction`, `close`) with Node's built-in
 * node:sqlite engine so repository and aggregation tests run against real SQL.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type OpParams = unknown[] | undefined;

interface OpExecuteResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  insertId?: number;
}

function makeConnection(db: any) {
  const execute = (sql: string, params?: OpParams): OpExecuteResult => {
    const stmt = db.prepare(sql);
    const isSelect = /^\s*(select|pragma|with)/i.test(sql);
    if (isSelect) {
      const rows = stmt.all(...(params ?? [])) as Record<string, unknown>[];
      return { rows, rowsAffected: 0 };
    }
    const info = stmt.run(...(params ?? []));
    return {
      rows: [],
      rowsAffected: Number(info.changes ?? 0),
      insertId:
        info.lastInsertRowid != null
          ? Number(info.lastInsertRowid)
          : undefined,
    };
  };

  const executeBatch = (
    statements: Array<{ sql: string; params?: OpParams } | [string, OpParams?]>,
  ) => {
    for (const s of statements) {
      if (Array.isArray(s)) {
        execute(s[0], s[1]);
      } else {
        execute(s.sql, s.params);
      }
    }
  };

  const transaction = (fn: (tx?: unknown) => unknown) => {
    db.exec('BEGIN');
    try {
      const result = fn({ execute, executeBatch });
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    execute,
    executeSync: execute,
    executeBatch,
    transaction,
    close: () => db.close(),
    delete: () => db.close(),
  };
}

// Each ":memory:"-style name gets its own fresh DB per open() call in tests.
export function open(_options: { name: string; location?: string }) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return makeConnection(db);
}

export const IOS_LIBRARY_PATH = 'mock://library';
export const IOS_DOCUMENT_PATH = 'mock://documents';
export const ANDROID_DATABASE_PATH = 'mock://android';
export default { open };
