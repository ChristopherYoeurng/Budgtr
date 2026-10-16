/**
 * Screen interaction tests (Tasks 8 & 9).
 *
 * These seed the shared app database (same op-sqlite singleton the screens use
 * via getDatabase()) and drive the UI through RNTL v14 (async render + press).
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { getDatabase, _resetDatabaseSingleton } from '../src/db/db';
import {
  AccountsRepo,
  BudgetsRepo,
  CategoriesRepo,
  ItemsRepo,
  RecurringRepo,
  TransactionsRepo,
  budgetProgress,
} from '../src/db/repositories';
import { AppDataProvider } from '../src/context/AppDataContext';
import { TransactionsScreen } from '../src/screens/TransactionsScreen';
import { BudgetsScreen } from '../src/screens/BudgetsScreen';
import { InsightsScreen } from '../src/screens/InsightsScreen';
import { AccountsScreen } from '../src/screens/AccountsScreen';
import { NetWorthRepo } from '../src/db/repositories';
import { currentMonthKey } from '../src/utils/format';

jest.useFakeTimers();

function seed() {
  const db = getDatabase();
  ItemsRepo.upsert(db, {
    itemId: 'i1',
    accessToken: 'a1',
    institutionName: 'Bank',
    syncCursor: null,
    createdAt: '',
  });
  AccountsRepo.upsert(db, {
    accountId: 'ac1',
    itemId: 'i1',
    name: 'Checking',
    officialName: null,
    mask: '0000',
    type: 'depository',
    subtype: 'checking',
    currentBalance: 1000,
    availableBalance: 1000,
    isoCurrency: 'USD',
  });
  return db;
}

afterEach(() => {
  _resetDatabaseSingleton();
});

describe('TransactionsScreen', () => {
  it('reassigns a transaction category and persists it', async () => {
    const db = seed();
    TransactionsRepo.upsert(db, {
      transactionId: 't1',
      accountId: 'ac1',
      date: '2026-01-10',
      name: 'Shell',
      merchantName: 'Shell',
      amount: 40,
      pending: false,
      categoryId: null,
      isoCurrency: 'USD',
    });
    const user = userEvent.setup();

    await render(
      <AppDataProvider>
        <TransactionsScreen />
      </AppDataProvider>,
    );

    await user.press(screen.getByTestId('tx-t1'));
    await user.press(screen.getByTestId('cat-Groceries'));

    const groceriesId = CategoriesRepo.findByName(db, 'Groceries')!.categoryId;
    expect(TransactionsRepo.list(db)[0].categoryId).toBe(groceriesId);
  });
});

describe('BudgetsScreen', () => {
  it('sets a monthly limit that is persisted and shown as progress', async () => {
    const db = seed();
    const month = currentMonthKey();
    const groceries = CategoriesRepo.findByName(db, 'Groceries')!.categoryId;
    // Pre-seed spend so progress is computable.
    TransactionsRepo.upsert(db, {
      transactionId: 'tg',
      accountId: 'ac1',
      date: `${month}-05`,
      name: 'Market',
      merchantName: 'Market',
      amount: 60,
      pending: false,
      categoryId: groceries,
      isoCurrency: 'USD',
    });
    const user = userEvent.setup();

    await render(
      <AppDataProvider>
        <BudgetsScreen />
      </AppDataProvider>,
    );

    await user.press(screen.getByTestId('budget-add'));
    await user.press(screen.getByTestId('budget-cat-Groceries'));
    await user.type(screen.getByTestId('budget-limit-input'), '100');
    await user.press(screen.getByTestId('budget-save'));

    const budgets = BudgetsRepo.forMonth(db, month);
    expect(budgets).toHaveLength(1);
    expect(budgets[0].limitAmount).toBe(100);

    const prog = budgetProgress(db, month);
    expect(prog[0].spent).toBe(60);
    expect(prog[0].overBudget).toBe(false);
  });
});

describe('InsightsScreen', () => {
  it('renders the empty state with no data', async () => {
    seed();
    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('insights-empty')).toBeOnTheScreen();
  });

  it('renders category and monthly charts when data exists', async () => {
    const db = seed();
    const month = currentMonthKey();
    const groceries = CategoriesRepo.findByName(db, 'Groceries')!.categoryId;
    const dining = CategoriesRepo.findByName(db, 'Restaurants')!.categoryId;
    TransactionsRepo.upsert(db, {
      transactionId: 'c1',
      accountId: 'ac1',
      date: `${month}-04`,
      name: 'Market',
      merchantName: 'Market',
      amount: 120,
      pending: false,
      categoryId: groceries,
      isoCurrency: 'USD',
    });
    TransactionsRepo.upsert(db, {
      transactionId: 'c2',
      accountId: 'ac1',
      date: `${month}-06`,
      name: 'Diner',
      merchantName: 'Diner',
      amount: 45,
      pending: false,
      categoryId: dining,
      isoCurrency: 'USD',
    });

    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('insights-pie')).toBeOnTheScreen();
    expect(screen.getByTestId('insights-bar')).toBeOnTheScreen();
  });

  it('shows detected recurring streams in the bills section', async () => {
    const db = seed();
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
    ]);

    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('insights-recurring')).toBeOnTheScreen();
    expect(screen.getByText('Netflix')).toBeOnTheScreen();
  });
});

describe('AccountsScreen net worth chart', () => {
  it('renders the chart with range selectors when snapshots exist', async () => {
    const db = seed();
    NetWorthRepo.snapshot(db, 1000, '2026-01-01');
    NetWorthRepo.snapshot(db, 1200, '2026-01-02');
    NetWorthRepo.snapshot(db, 1500, '2026-01-03');

    await render(
      <AppDataProvider>
        <AccountsScreen />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('networth-chart')).toBeOnTheScreen();
    // Range selectors present.
    expect(screen.getByTestId('networth-range-1W')).toBeOnTheScreen();
    expect(screen.getByTestId('networth-range-ALL')).toBeOnTheScreen();
  });

  it('shows an insufficient-history message with <2 snapshots', async () => {
    const db = seed();
    NetWorthRepo.snapshot(db, 1000, '2026-01-01');

    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <AccountsScreen />
      </AppDataProvider>,
    );
    // Default range 1M; a single point -> insufficient message.
    expect(screen.getByTestId('networth-insufficient')).toBeOnTheScreen();
    // Switching to ALL still only has one point.
    await user.press(screen.getByTestId('networth-range-ALL'));
    expect(screen.getByTestId('networth-insufficient')).toBeOnTheScreen();
  });
});
