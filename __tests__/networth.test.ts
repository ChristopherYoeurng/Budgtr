/**
 * Tests for net-worth snapshot persistence and date-range helpers.
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from '../src/db/types';
import { runMigrations } from '../src/db/migrations';
import { AccountsRepo, NetWorthRepo } from '../src/db/repositories';
import { rangeStartDate, shortDate } from '../src/utils/format';

function makeDb(): Database {
  const conn = open({ name: 'nw-test.db' }) as unknown as {
    execute: (sql: string, params?: unknown[]) => QueryResult;
    transaction: (fn: () => unknown) => unknown;
    close: () => void;
  };
  const db: Database = {
    execute: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      conn.execute(sql, params) as QueryResult<Row>,
    executeBatch: stmts => stmts.forEach(s => conn.execute(s.sql, s.params)),
    transaction: fn => conn.transaction(fn) as never,
    close: () => conn.close(),
  };
  runMigrations(db);
  return db;
}

describe('NetWorthRepo', () => {
  it('stores one snapshot per day (upsert) and reads back ordered', () => {
    const db = makeDb();
    NetWorthRepo.snapshot(db, 1000, '2026-01-01');
    NetWorthRepo.snapshot(db, 1500, '2026-01-02');
    NetWorthRepo.snapshot(db, 1600, '2026-01-02'); // same day -> overwrite
    NetWorthRepo.snapshot(db, 2000, '2026-01-10');

    const all = NetWorthRepo.all(db);
    expect(all).toHaveLength(3); // 01-01, 01-02, 01-10
    expect(all.map(p => p.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-10',
    ]);
    expect(all[1].netWorth).toBe(1600); // overwritten value
    db.close();
  });

  it('filters snapshots by since-date', () => {
    const db = makeDb();
    NetWorthRepo.snapshot(db, 100, '2026-01-01');
    NetWorthRepo.snapshot(db, 200, '2026-02-01');
    NetWorthRepo.snapshot(db, 300, '2026-03-01');

    const since = NetWorthRepo.since(db, '2026-02-01');
    expect(since.map(p => p.date)).toEqual(['2026-02-01', '2026-03-01']);
    db.close();
  });
});

describe('reconstructHistory', () => {
  function seedTx(
    db: Database,
    id: string,
    date: string,
    amount: number,
    pending = 0,
  ) {
    db.execute(
      `INSERT INTO transactions
        (transaction_id, account_id, date, name, merchant_name, amount, pending, category_id, iso_currency)
       VALUES (?, 'acc', ?, 'n', NULL, ?, ?, NULL, 'USD');`,
      [id, date, amount, pending],
    );
  }

  function seedAccount(db: Database) {
    db.execute(
      `INSERT INTO items (item_id, access_token, institution_name) VALUES ('i','a','Bank');`,
    );
    db.execute(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance, iso_currency)
       VALUES ('acc','i','Checking','depository',1000,'USD');`,
    );
  }

  it('reconstructs net worth backward from current value', () => {
    const db = makeDb();
    seedAccount(db);
    seedTx(db, 'a', '2026-01-02', 100); // spent 100
    seedTx(db, 'b', '2026-01-03', -500); // income 500
    seedTx(db, 'c', '2026-01-03', -50); // income 50
    seedTx(db, 'd', '2026-01-04', 20, 1); // pending -> excluded

    const n = NetWorthRepo.reconstructHistory(db, 1000);
    expect(n).toBe(2); // two distinct non-pending dates

    const byDate = Object.fromEntries(
      NetWorthRepo.all(db).map(p => [p.date, p.netWorth]),
    );
    // networth(01-02) = 1000 + sum(amount after 01-02) = 1000 + (-500-50) = 450
    expect(byDate['2026-01-02']).toBe(450);
    // networth(01-03) = 1000 + 0 = 1000
    expect(byDate['2026-01-03']).toBe(1000);
    db.close();
  });

  it('does not overwrite an existing real snapshot (INSERT OR IGNORE)', () => {
    const db = makeDb();
    seedAccount(db);
    NetWorthRepo.snapshot(db, 999, '2026-01-02'); // real snapshot first
    seedTx(db, 'a', '2026-01-02', 100);
    seedTx(db, 'b', '2026-01-03', -500);
    NetWorthRepo.reconstructHistory(db, 1000);
    const byDate = Object.fromEntries(
      NetWorthRepo.all(db).map(p => [p.date, p.netWorth]),
    );
    expect(byDate['2026-01-02']).toBe(999); // preserved
    db.close();
  });

  it('excludes accounts flagged out of net worth from the total + history', () => {
    const db = makeDb();
    seedAccount(db); // 'acc' depository 1000, included
    // Add an investment account (no transactions) worth 500.
    db.execute(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance, iso_currency, include_in_net_worth)
       VALUES ('inv','i','Brokerage','investment',500,'USD',1);`,
    );
    expect(AccountsRepo.netWorth(db)).toBe(1500); // 1000 + 500

    // Exclude the investment account.
    AccountsRepo.setIncludeInNetWorth(db, 'inv', false);
    expect(AccountsRepo.netWorth(db)).toBe(1000);

    // Reconstruction baseline now reflects only included accounts.
    seedTx(db, 'a', '2026-01-02', 100); // belongs to 'acc' (included)
    NetWorthRepo.clearSnapshots(db);
    NetWorthRepo.reconstructHistory(db);
    const byDate = Object.fromEntries(
      NetWorthRepo.all(db).map(p => [p.date, p.netWorth]),
    );
    // Only day 01-02 exists; it's the last txn day so = current included NW 1000.
    expect(byDate['2026-01-02']).toBe(1000);
    db.close();
  });

  it('reconstruction holds non-transaction (investment) balances as baseline', () => {
    const db = makeDb();
    seedAccount(db); // depository 1000
    db.execute(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance, iso_currency, include_in_net_worth)
       VALUES ('inv','i','Brokerage','investment',2000,'USD',1);`,
    );
    // Current NW = 3000. One spend of 100 on the cash account on 01-02.
    seedTx(db, 'a', '2026-01-02', 100);
    seedTx(db, 'b', '2026-01-05', -50); // income on 01-05
    NetWorthRepo.clearSnapshots(db);
    NetWorthRepo.reconstructHistory(db);
    const byDate = Object.fromEntries(
      NetWorthRepo.all(db).map(p => [p.date, p.netWorth]),
    );
    // 01-02: 3000 + sum(amount after) = 3000 + (-50) = 2950 (investment baseline included)
    expect(byDate['2026-01-02']).toBe(2950);
    // 01-05: 3000 + 0 = 3000
    expect(byDate['2026-01-05']).toBe(3000);
    db.close();
  });

  it('remove() deletes the account and its transactions (FK cascade)', () => {
    const db = makeDb();
    seedAccount(db);
    seedTx(db, 'a', '2026-01-02', 100);
    expect(AccountsRepo.all(db)).toHaveLength(1);
    AccountsRepo.remove(db, 'acc');
    expect(AccountsRepo.all(db)).toHaveLength(0);
    const txCount = db.execute<{ c: number }>(
      `SELECT COUNT(*) AS c FROM transactions;`,
    ).rows[0].c;
    expect(txCount).toBe(0); // cascaded
    db.close();
  });
});

describe('rangeStartDate', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('computes correct start dates per range', () => {
    expect(rangeStartDate('1W', now)).toBe('2026-06-08');
    expect(rangeStartDate('1M', now)).toBe('2026-05-15');
    expect(rangeStartDate('3M', now)).toBe('2026-03-15');
    expect(rangeStartDate('1Y', now)).toBe('2025-06-15');
    expect(rangeStartDate('ALL', now)).toBe('1970-01-01');
  });
});

describe('shortDate', () => {
  it('formats YYYY-MM-DD as M/D', () => {
    expect(shortDate('2026-01-05')).toBe('1/5');
    expect(shortDate('2026-12-25')).toBe('12/25');
  });
});
