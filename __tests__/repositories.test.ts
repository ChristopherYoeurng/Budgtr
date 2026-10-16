/**
 * Repository + aggregation tests against the op-sqlite mock (real node:sqlite).
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from '../src/db/types';
import { runMigrations } from '../src/db/migrations';
import {
  AccountsRepo,
  BudgetsRepo,
  CategoriesRepo,
  ItemsRepo,
  TransactionsRepo,
  budgetProgress,
  spendByCategory,
  spendByMonth,
} from '../src/db/repositories';

function makeDb(): Database {
  const conn = open({ name: 'repo-test.db' }) as unknown as {
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

function catId(db: Database, name: string): number {
  return CategoriesRepo.findByName(db, name)!.categoryId;
}

function seedBasics(db: Database) {
  ItemsRepo.upsert(db, {
    itemId: 'item_1',
    accessToken: 'access_1',
    institutionName: 'Test Bank',
    syncCursor: null,
    createdAt: '',
  });
  AccountsRepo.upsert(db, {
    accountId: 'acc_check',
    itemId: 'item_1',
    name: 'Checking',
    officialName: null,
    mask: '0000',
    type: 'depository',
    subtype: 'checking',
    currentBalance: 2500,
    availableBalance: 2500,
    isoCurrency: 'USD',
    includeInNetWorth: true,
  });
  AccountsRepo.upsert(db, {
    accountId: 'acc_credit',
    itemId: 'item_1',
    name: 'Credit Card',
    officialName: null,
    mask: '1111',
    type: 'credit',
    subtype: 'credit card',
    currentBalance: 500,
    availableBalance: null,
    isoCurrency: 'USD',
    includeInNetWorth: true,
  });
}

describe('ItemsRepo', () => {
  it('upserts and reads back the sync cursor', () => {
    const db = makeDb();
    seedBasics(db);
    expect(ItemsRepo.getCursor(db, 'item_1')).toBeNull();
    ItemsRepo.setCursor(db, 'item_1', 'cursor_abc');
    expect(ItemsRepo.getCursor(db, 'item_1')).toBe('cursor_abc');
    expect(ItemsRepo.all(db)).toHaveLength(1);
    db.close();
  });
});

describe('AccountsRepo', () => {
  it('computes net worth as assets minus liabilities', () => {
    const db = makeDb();
    seedBasics(db);
    // 2500 (checking) - 500 (credit) = 2000
    expect(AccountsRepo.netWorth(db)).toBe(2000);
    db.close();
  });

  it('upsert updates an existing account balance', () => {
    const db = makeDb();
    seedBasics(db);
    AccountsRepo.upsert(db, {
      accountId: 'acc_check',
      itemId: 'item_1',
      name: 'Checking',
      officialName: null,
      mask: '0000',
      type: 'depository',
      subtype: 'checking',
      currentBalance: 3000,
      availableBalance: 3000,
      isoCurrency: 'USD',
      includeInNetWorth: true,
    });
    expect(AccountsRepo.netWorth(db)).toBe(2500); // 3000 - 500
    expect(AccountsRepo.all(db)).toHaveLength(2);
    db.close();
  });
});

describe('TransactionsRepo', () => {
  it('lists newest first and supports search + category changes', () => {
    const db = makeDb();
    seedBasics(db);
    const groceries = catId(db, 'Groceries');

    TransactionsRepo.upsert(db, {
      transactionId: 't1',
      accountId: 'acc_check',
      date: '2026-01-05',
      name: 'Whole Foods',
      merchantName: 'Whole Foods',
      amount: 60,
      pending: false,
      categoryId: groceries,
      isoCurrency: 'USD',
    });
    TransactionsRepo.upsert(db, {
      transactionId: 't2',
      accountId: 'acc_check',
      date: '2026-01-10',
      name: 'Shell Gas',
      merchantName: 'Shell',
      amount: 40,
      pending: false,
      categoryId: null,
      isoCurrency: 'USD',
    });

    const all = TransactionsRepo.list(db);
    expect(all.map(t => t.transactionId)).toEqual(['t2', 't1']); // newest first

    const search = TransactionsRepo.list(db, { search: 'whole' });
    expect(search).toHaveLength(1);
    expect(search[0].transactionId).toBe('t1');

    TransactionsRepo.setCategory(db, 't2', groceries);
    expect(TransactionsRepo.list(db, { search: 'shell' })[0].categoryId).toBe(
      groceries,
    );

    TransactionsRepo.remove(db, 't1');
    expect(TransactionsRepo.list(db)).toHaveLength(1);
    db.close();
  });

  it('filters by category ids (including the Uncategorized bucket)', () => {
    const db = makeDb();
    seedBasics(db);
    const groceries = catId(db, 'Groceries');
    const dining = catId(db, 'Restaurants');
    const mk = (id: string, date: string, cat: number | null) =>
      TransactionsRepo.upsert(db, {
        transactionId: id,
        accountId: 'acc_check',
        date,
        name: id,
        merchantName: id,
        amount: 10,
        pending: false,
        categoryId: cat,
        isoCurrency: 'USD',
      });
    mk('g', '2026-01-02', groceries);
    mk('d', '2026-01-03', dining);
    mk('u', '2026-01-04', null); // uncategorized

    const onlyGroceries = TransactionsRepo.list(db, {
      filter: { categoryIds: [groceries] },
    });
    expect(onlyGroceries.map(t => t.transactionId)).toEqual(['g']);

    const groceriesOrDining = TransactionsRepo.list(db, {
      filter: { categoryIds: [groceries, dining] },
    });
    expect(groceriesOrDining.map(t => t.transactionId).sort()).toEqual([
      'd',
      'g',
    ]);

    // -1 is the Uncategorized sentinel.
    const uncategorized = TransactionsRepo.list(db, {
      filter: { categoryIds: [-1] },
    });
    expect(uncategorized.map(t => t.transactionId)).toEqual(['u']);

    const groceriesOrUncat = TransactionsRepo.list(db, {
      filter: { categoryIds: [groceries, -1] },
    });
    expect(groceriesOrUncat.map(t => t.transactionId).sort()).toEqual([
      'g',
      'u',
    ]);
    db.close();
  });

  it('filters by inclusive date range', () => {
    const db = makeDb();
    seedBasics(db);
    const mk = (id: string, date: string) =>
      TransactionsRepo.upsert(db, {
        transactionId: id,
        accountId: 'acc_check',
        date,
        name: id,
        merchantName: id,
        amount: 10,
        pending: false,
        categoryId: null,
        isoCurrency: 'USD',
      });
    mk('a', '2026-01-01');
    mk('b', '2026-02-15');
    mk('c', '2026-03-20');

    const feb = TransactionsRepo.list(db, {
      filter: { startDate: '2026-02-01', endDate: '2026-02-28' },
    });
    expect(feb.map(t => t.transactionId)).toEqual(['b']);

    const fromFeb = TransactionsRepo.list(db, {
      filter: { startDate: '2026-02-01' },
    });
    expect(fromFeb.map(t => t.transactionId).sort()).toEqual(['b', 'c']);

    // Combined with search.
    const combined = TransactionsRepo.list(db, {
      search: 'a',
      filter: { startDate: '2026-01-01', endDate: '2026-01-31' },
    });
    expect(combined.map(t => t.transactionId)).toEqual(['a']);
    db.close();
  });
});

describe('aggregations', () => {
  function seedTxns(db: Database) {
    const groceries = catId(db, 'Groceries');
    const restaurants = catId(db, 'Restaurants');
    const income = catId(db, 'Income');
    const rows: Array<[string, string, number, number | null, number]> = [
      // id, date, amount, categoryId, pending
      ['a', '2026-01-03', 100, groceries, 0],
      ['b', '2026-01-15', 50, groceries, 0],
      ['c', '2026-01-20', 80, restaurants, 0],
      ['d', '2026-01-25', 30, restaurants, 1], // pending -> excluded
      ['e', '2026-01-28', 2000, income, 0], // income -> excluded from spend
      ['f', '2025-12-10', 70, groceries, 0], // prior month
    ];
    rows.forEach(([id, date, amount, categoryId, pending]) => {
      TransactionsRepo.upsert(db, {
        transactionId: id,
        accountId: 'acc_check',
        date,
        name: `txn ${id}`,
        merchantName: null,
        amount,
        pending: pending === 1,
        categoryId,
        isoCurrency: 'USD',
      });
    });
  }

  it('spendByCategory sums money-out per category, excluding pending/income', () => {
    const db = makeDb();
    seedBasics(db);
    seedTxns(db);
    const result = spendByCategory(db, '2026-01');
    const byName = Object.fromEntries(
      result.map(r => [r.categoryName, r.total]),
    );
    expect(byName.Groceries).toBe(150); // 100 + 50 (not the Dec 70)
    expect(byName.Restaurants).toBe(80); // pending 30 excluded
    expect(byName.Income).toBeUndefined(); // income excluded
    db.close();
  });

  it('spendByMonth groups totals by month ascending', () => {
    const db = makeDb();
    seedBasics(db);
    seedTxns(db);
    const result = spendByMonth(db, 12);
    const byMonth = Object.fromEntries(result.map(r => [r.month, r.total]));
    expect(byMonth['2025-12']).toBe(70);
    expect(byMonth['2026-01']).toBe(230); // 100+50+80 (pending+income excluded)
    // ascending order
    expect(result.map(r => r.month)).toEqual(['2025-12', '2026-01']);
    db.close();
  });

  it('budgetProgress computes spent/remaining/overBudget', () => {
    const db = makeDb();
    seedBasics(db);
    seedTxns(db);
    const groceries = catId(db, 'Groceries');
    const restaurants = catId(db, 'Restaurants');
    BudgetsRepo.setLimit(db, groceries, '2026-01', 120); // spent 150 -> over
    BudgetsRepo.setLimit(db, restaurants, '2026-01', 200); // spent 80 -> under

    const progress = budgetProgress(db, '2026-01');
    const g = progress.find(p => p.categoryId === groceries)!;
    const r = progress.find(p => p.categoryId === restaurants)!;

    expect(g.spent).toBe(150);
    expect(g.remaining).toBe(-30);
    expect(g.overBudget).toBe(true);

    expect(r.spent).toBe(80);
    expect(r.remaining).toBe(120);
    expect(r.overBudget).toBe(false);
    db.close();
  });

  it('BudgetsRepo.setLimit upserts (updates existing limit)', () => {
    const db = makeDb();
    seedBasics(db);
    const groceries = catId(db, 'Groceries');
    BudgetsRepo.setLimit(db, groceries, '2026-01', 100);
    BudgetsRepo.setLimit(db, groceries, '2026-01', 250);
    const budgets = BudgetsRepo.forMonth(db, '2026-01');
    expect(budgets).toHaveLength(1);
    expect(budgets[0].limitAmount).toBe(250);
    db.close();
  });
});
