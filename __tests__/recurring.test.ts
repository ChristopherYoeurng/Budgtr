/**
 * Tests for recurring detection (Task 11): local heuristic, Plaid stream
 * mapping, next-date estimation, and persistence via RecurringRepo + migration.
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from '../src/db/types';
import { runMigrations } from '../src/db/migrations';
import { RecurringRepo } from '../src/db/repositories';
import {
  detectRecurringHeuristic,
  estimateNextDate,
  mapPlaidRecurring,
} from '../src/plaid/recurring';
import type { Transaction } from '../src/types/models';

function makeDb(): Database {
  const conn = open({ name: 'recurring-test.db' }) as unknown as {
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

function txn(id: string, date: string, amount: number, name = 'Netflix'): Transaction {
  return {
    transactionId: id,
    accountId: 'ac1',
    date,
    name,
    merchantName: name,
    amount,
    pending: false,
    categoryId: null,
    isoCurrency: 'USD',
  };
}

describe('estimateNextDate', () => {
  it('adds the right interval per frequency', () => {
    expect(estimateNextDate('2026-01-01', 'WEEKLY')).toBe('2026-01-08');
    expect(estimateNextDate('2026-01-01', 'BIWEEKLY')).toBe('2026-01-15');
    expect(estimateNextDate('2026-01-01', 'MONTHLY')).toBe('2026-01-31');
    expect(estimateNextDate('2026-01-01', 'UNKNOWN')).toBeNull();
  });
});

describe('detectRecurringHeuristic', () => {
  it('flags a monthly, stable-amount merchant with >=3 occurrences', () => {
    const txns = [
      txn('n1', '2025-11-03', 15.99),
      txn('n2', '2025-12-03', 15.99),
      txn('n3', '2026-01-03', 15.99),
    ];
    const streams = detectRecurringHeuristic(txns);
    expect(streams).toHaveLength(1);
    expect(streams[0].frequency).toBe('MONTHLY');
    expect(streams[0].direction).toBe('outflow');
    expect(streams[0].averageAmount).toBeCloseTo(15.99, 2);
    expect(streams[0].source).toBe('heuristic');
    expect(streams[0].nextDate).toBe('2026-02-02'); // last + 30d
  });

  it('ignores irregular or too-few transactions', () => {
    expect(detectRecurringHeuristic([txn('a', '2026-01-01', 10)])).toHaveLength(0);
    const irregular = [
      txn('b1', '2026-01-01', 10, 'Shop'),
      txn('b2', '2026-01-04', 90, 'Shop'),
      txn('b3', '2026-02-20', 10, 'Shop'),
    ];
    expect(detectRecurringHeuristic(irregular)).toHaveLength(0);
  });

  it('detects recurring inflow (income) as inflow direction', () => {
    const pay = [
      txn('p1', '2025-12-01', -2000, 'ACME Payroll'),
      txn('p2', '2025-12-15', -2000, 'ACME Payroll'),
      txn('p3', '2025-12-29', -2000, 'ACME Payroll'),
      txn('p4', '2026-01-12', -2000, 'ACME Payroll'),
    ];
    const streams = detectRecurringHeuristic(pay);
    expect(streams).toHaveLength(1);
    expect(streams[0].direction).toBe('inflow');
    expect(streams[0].frequency).toBe('BIWEEKLY');
  });
});

describe('mapPlaidRecurring', () => {
  it('maps inflow/outflow streams with normalized frequency and amounts', () => {
    const mapped = mapPlaidRecurring({
      inflow_streams: [
        {
          stream_id: 'in1',
          description: 'Payroll',
          merchant_name: 'ACME',
          frequency: 'BIWEEKLY',
          last_amount: { amount: -2000, iso_currency_code: 'USD' },
          average_amount: { amount: -2000, iso_currency_code: 'USD' },
          last_date: '2026-01-10',
          is_active: true,
          status: 'MATURE',
        },
      ],
      outflow_streams: [
        {
          stream_id: 'out1',
          description: 'Netflix',
          merchant_name: 'Netflix',
          frequency: 'MONTHLY',
          last_amount: { amount: 15.99, iso_currency_code: 'USD' },
          average_amount: { amount: 15.99, iso_currency_code: 'USD' },
          last_date: '2026-01-03',
          is_active: true,
          status: 'MATURE',
        },
      ],
    });
    expect(mapped).toHaveLength(2);
    const income = mapped.find(m => m.streamId === 'in1')!;
    expect(income.direction).toBe('inflow');
    expect(income.lastAmount).toBe(2000); // absolute value
    const netflix = mapped.find(m => m.streamId === 'out1')!;
    expect(netflix.direction).toBe('outflow');
    expect(netflix.frequency).toBe('MONTHLY');
    expect(netflix.nextDate).toBe('2026-02-02');
  });
});

describe('RecurringRepo + migration v2', () => {
  it('creates the recurring_streams table and persists active streams', () => {
    const db = makeDb();
    const tables = db
      .execute<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_streams';`,
      )
      .rows.map(r => r.name);
    expect(tables).toContain('recurring_streams');

    RecurringRepo.replaceAll(db, [
      {
        streamId: 's1',
        description: 'Netflix',
        merchantName: 'Netflix',
        direction: 'outflow',
        frequency: 'MONTHLY',
        lastAmount: 15.99,
        averageAmount: 15.99,
        lastDate: '2026-01-03',
        nextDate: '2026-02-02',
        isActive: true,
        source: 'plaid',
      },
      {
        streamId: 's2',
        description: 'Old sub',
        merchantName: null,
        direction: 'outflow',
        frequency: 'MONTHLY',
        lastAmount: 5,
        averageAmount: 5,
        lastDate: '2025-01-01',
        nextDate: null,
        isActive: false, // should be filtered out of all()
        source: 'plaid',
      },
    ]);

    const active = RecurringRepo.all(db);
    expect(active).toHaveLength(1);
    expect(active[0].streamId).toBe('s1');

    // replaceAll clears previous rows.
    RecurringRepo.replaceAll(db, []);
    expect(RecurringRepo.all(db)).toHaveLength(0);
    db.close();
  });
});
