/**
 * Tests for account linking persistence (Task 5) and the sync engine (Task 6).
 */
import { open } from '@op-engineering/op-sqlite';
import type { Database, QueryResult } from '../src/db/types';
import { runMigrations } from '../src/db/migrations';
import {
  AccountsRepo,
  ItemsRepo,
  TransactionsRepo,
} from '../src/db/repositories';
import { persistLinkedItem } from '../src/plaid/linking';
import { syncItem } from '../src/plaid/sync';
import type { PlaidClient } from '../src/plaid/client';

function makeDb(): Database {
  const conn = open({ name: 'link-test.db' }) as unknown as {
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

describe('persistLinkedItem', () => {
  it('exchanges token, fetches accounts, and persists item + accounts', async () => {
    const db = makeDb();
    const client = {
      exchangePublicToken: jest.fn(async () => ({
        access_token: 'access_1',
        item_id: 'item_1',
      })),
      getAccounts: jest.fn(async () => ({
        accounts: [
          {
            account_id: 'acc_1',
            name: 'Checking',
            official_name: 'Premier Checking',
            mask: '0000',
            type: 'depository',
            subtype: 'checking',
            balances: { current: 1200, available: 1100, iso_currency_code: 'USD' },
          },
          {
            account_id: 'acc_2',
            name: 'Card',
            official_name: null,
            mask: '1111',
            type: 'credit',
            subtype: 'credit card',
            balances: { current: 300, available: null, iso_currency_code: 'USD' },
          },
        ],
        item: { item_id: 'item_1', institution_id: 'ins_1' },
      })),
    } as unknown as PlaidClient;

    const itemId = await persistLinkedItem(db, client, 'public_1', 'Chase');
    expect(itemId).toBe('item_1');

    const items = ItemsRepo.all(db);
    expect(items).toHaveLength(1);
    expect(items[0].institutionName).toBe('Chase');
    expect(items[0].accessToken).toBe('access_1');

    const accounts = AccountsRepo.all(db);
    expect(accounts).toHaveLength(2);
    expect(AccountsRepo.netWorth(db)).toBe(900); // 1200 - 300
    db.close();
  });
});

describe('syncItem', () => {
  function seedItem(db: Database) {
    ItemsRepo.upsert(db, {
      itemId: 'item_1',
      accessToken: 'access_1',
      institutionName: 'Chase',
      syncCursor: null,
      createdAt: '',
    });
    AccountsRepo.upsert(db, {
      accountId: 'acc_1',
      itemId: 'item_1',
      name: 'Checking',
      officialName: null,
      mask: '0000',
      type: 'depository',
      subtype: 'checking',
      currentBalance: 1000,
      availableBalance: 1000,
      isoCurrency: 'USD',
    });
  }

  it('applies added across paginated pages and advances the cursor', async () => {
    const db = makeDb();
    seedItem(db);

    const pages = [
      {
        added: [
          {
            transaction_id: 't1',
            account_id: 'acc_1',
            date: '2026-01-05',
            name: 'Coffee',
            merchant_name: 'Blue Bottle',
            amount: 5,
            pending: false,
            iso_currency_code: 'USD',
            personal_finance_category: { primary: 'FOOD_AND_DRINK' },
          },
        ],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: true,
      },
      {
        added: [
          {
            transaction_id: 't2',
            account_id: 'acc_1',
            date: '2026-01-06',
            name: 'Uber',
            merchant_name: 'Uber',
            amount: 20,
            pending: false,
            iso_currency_code: 'USD',
            personal_finance_category: { primary: 'TRANSPORTATION' },
          },
        ],
        modified: [],
        removed: [],
        next_cursor: 'c2',
        has_more: false,
      },
    ];
    let call = 0;
    const client = {
      transactionsSync: jest.fn(async () => pages[call++]),
    } as unknown as PlaidClient;

    const result = await syncItem(db, client, 'item_1', 'access_1');
    expect(result.added).toBe(2);
    expect(TransactionsRepo.list(db)).toHaveLength(2);
    expect(ItemsRepo.getCursor(db, 'item_1')).toBe('c2');

    // Category mapping applied (Coffee -> Food & Dining).
    const coffee = TransactionsRepo.list(db, { search: 'coffee' })[0];
    expect(coffee.categoryId).not.toBeNull();
    db.close();
  });

  it('handles pending -> posted (removed pending, added posted)', async () => {
    const db = makeDb();
    seedItem(db);

    // First sync: a pending transaction.
    const client1 = {
      transactionsSync: jest.fn(async () => ({
        added: [
          {
            transaction_id: 'pending_1',
            account_id: 'acc_1',
            date: '2026-01-07',
            name: 'Amazon',
            merchant_name: 'Amazon',
            amount: 50,
            pending: true,
            iso_currency_code: 'USD',
            personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
          },
        ],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      })),
    } as unknown as PlaidClient;
    await syncItem(db, client1, 'item_1', 'access_1');
    expect(TransactionsRepo.list(db)).toHaveLength(1);
    expect(TransactionsRepo.list(db)[0].pending).toBe(true);

    // Second sync: pending removed, posted added.
    const client2 = {
      transactionsSync: jest.fn(async () => ({
        added: [
          {
            transaction_id: 'posted_1',
            account_id: 'acc_1',
            date: '2026-01-08',
            name: 'Amazon',
            merchant_name: 'Amazon',
            amount: 50,
            pending: false,
            iso_currency_code: 'USD',
            personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
          },
        ],
        modified: [],
        removed: [{ transaction_id: 'pending_1' }],
        next_cursor: 'c2',
        has_more: false,
      })),
    } as unknown as PlaidClient;
    const r = await syncItem(db, client2, 'item_1', 'access_1');
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);

    const txns = TransactionsRepo.list(db);
    expect(txns).toHaveLength(1);
    expect(txns[0].transactionId).toBe('posted_1');
    expect(txns[0].pending).toBe(false);
    db.close();
  });
});
