/**
 * Minimal database abstraction used by the repository layer.
 *
 * The production implementation (src/db/db.ts) is backed by
 * @op-engineering/op-sqlite. Tests supply an equivalent implementation
 * backed by Node's built-in node:sqlite via the op-sqlite jest mock.
 *
 * Keeping the surface tiny (execute / executeBatch / transaction) means the
 * repositories are written against a single contract and are fully testable
 * off-device.
 */

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowsAffected: number;
  insertId?: number;
}

export interface Database {
  /** Run a single SQL statement with optional positional params. */
  execute<Row = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): QueryResult<Row>;

  /** Run several statements as a unit (used by migrations). */
  executeBatch(statements: Array<{ sql: string; params?: unknown[] }>): void;

  /** Run a function inside a transaction, rolling back on throw. */
  transaction<T>(fn: () => T): T;

  /** Close the underlying database handle. */
  close(): void;
}
