/**
 * Tests for the Insights widget system (Task: widget layout + month comparison).
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { Database } from '../src/db/types';
import {
  AccountsRepo,
  CategoriesRepo,
  ItemsRepo,
  TransactionsRepo,
  WidgetPrefsRepo,
  availableMonths,
  cumulativeSpendByDay,
  spendComparison,
  spendTotalForMonth,
} from '../src/db/repositories';
import {
  resolveLayout,
  defaultLayout,
  WIDGETS,
} from '../src/components/widgets/registry';
import { niceAxisMax } from '../src/components/widgets/useMeasuredWidth';
import { getDatabase, _resetDatabaseSingleton } from '../src/db/db';
import { AppDataProvider } from '../src/context/AppDataContext';
import { InsightsScreen } from '../src/screens/InsightsScreen';

jest.useFakeTimers();

function makeDb(): Database {
  const db = getDatabase();
  return db;
}

afterEach(() => _resetDatabaseSingleton());

function seedAcct(db: Database) {
  ItemsRepo.upsert(db, {
    itemId: 'i',
    accessToken: 'a',
    institutionName: 'Bank',
    syncCursor: null,
    createdAt: '',
  });
  AccountsRepo.upsert(db, {
    accountId: 'ac',
    itemId: 'i',
    name: 'Checking',
    officialName: null,
    mask: '0000',
    type: 'depository',
    subtype: 'checking',
    currentBalance: 1000,
    availableBalance: 1000,
    isoCurrency: 'USD',
    includeInNetWorth: true,
  });
}

function tx(db: Database, id: string, date: string, amount: number, cat?: string) {
  const found = cat ? CategoriesRepo.findByName(db, cat) : null;
  TransactionsRepo.upsert(db, {
    transactionId: id,
    accountId: 'ac',
    date,
    name: id,
    merchantName: id,
    amount,
    pending: false,
    categoryId: found ? found.categoryId : null,
    isoCurrency: 'USD',
  });
}

describe('month comparison aggregations', () => {
  it('spendTotalForMonth sums spend excluding income/transfer/pending', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-03-01', 100, 'Groceries');
    tx(db, 'b', '2026-03-05', 50, 'Restaurants');
    tx(db, 'c', '2026-03-10', -2000, 'Income'); // excluded
    expect(spendTotalForMonth(db, '2026-03')).toBe(150);
    expect(spendTotalForMonth(db, '2026-02')).toBe(0);
  });

  it('availableMonths returns distinct months, newest first', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-01-01', 10);
    tx(db, 'b', '2026-03-01', 10);
    tx(db, 'c', '2026-03-15', 10);
    expect(availableMonths(db)).toEqual(['2026-03', '2026-01']);
  });

  it('spendComparison aligns per-category totals across two months', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-03-01', 100, 'Groceries');
    tx(db, 'b', '2026-02-01', 60, 'Groceries');
    tx(db, 'c', '2026-03-02', 40, 'Restaurants'); // only in current
    const cmp = spendComparison(db, '2026-03', '2026-02');
    const g = cmp.find(c => c.categoryName === 'Groceries')!;
    const r = cmp.find(c => c.categoryName === 'Restaurants')!;
    expect(g.current).toBe(100);
    expect(g.other).toBe(60);
    expect(r.current).toBe(40);
    expect(r.other).toBe(0);
  });
});

describe('cumulativeSpendByDay', () => {
  it('returns a running total per day for one category', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-03-03', 50, 'Groceries');
    tx(db, 'b', '2026-03-10', 30, 'Groceries');
    tx(db, 'c', '2026-03-05', 100, 'Restaurants'); // different cat, excluded
    tx(db, 'd', '2026-03-12', 999, 'Groceries'); // will be pending below
    // mark d pending
    db.execute(`UPDATE transactions SET pending = 1 WHERE transaction_id = 'd';`);

    const pts = cumulativeSpendByDay(db, '2026-03', ['Groceries']);
    expect(pts).toEqual([
      { day: 3, cumulative: 50 },
      { day: 10, cumulative: 80 },
    ]);
  });

  it('sums multiple selected categories into one running total', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-03-03', 50, 'Groceries');
    tx(db, 'b', '2026-03-05', 100, 'Restaurants');
    tx(db, 'c', '2026-03-10', 30, 'Groceries');

    const pts = cumulativeSpendByDay(db, '2026-03', [
      'Groceries',
      'Restaurants',
    ]);
    expect(pts).toEqual([
      { day: 3, cumulative: 50 },
      { day: 5, cumulative: 150 },
      { day: 10, cumulative: 180 },
    ]);
  });

  it('returns [] when no categories are selected', () => {
    const db = makeDb();
    seedAcct(db);
    tx(db, 'a', '2026-03-03', 50, 'Groceries');
    expect(cumulativeSpendByDay(db, '2026-03', [])).toEqual([]);
  });
});

describe('niceAxisMax', () => {
  it('returns a max just above the data with clean steps', () => {
    // 964 -> step rounds up so maxValue sits above 964 with headroom.
    const { maxValue, stepValue } = niceAxisMax(964, 3);
    expect(maxValue).toBeGreaterThanOrEqual(964);
    expect(maxValue).toBeLessThan(964 * 1.6); // not wildly oversized
    expect(stepValue * 3).toBe(maxValue);
  });

  it('handles zero / empty data', () => {
    const { maxValue } = niceAxisMax(0, 4);
    expect(maxValue).toBeGreaterThan(0);
  });

  it('keeps the tallest value below the top gridline (headroom)', () => {
    const { maxValue } = niceAxisMax(100, 4);
    expect(maxValue).toBeGreaterThan(100);
  });
});

describe('WidgetPrefsRepo + registry', () => {
  it('persists ordered layout with visibility', () => {
    const db = makeDb();
    WidgetPrefsRepo.saveAll(db, [
      { widgetId: 'recurring', visible: true },
      { widgetId: 'spend-by-category', visible: false },
    ]);
    const got = WidgetPrefsRepo.all(db);
    expect(got.map(p => p.widgetId)).toEqual(['recurring', 'spend-by-category']);
    expect(got[0].position).toBe(0);
    expect(got[1].visible).toBe(false);
  });

  it('resolveLayout falls back to default when empty', () => {
    expect(resolveLayout([]).map(l => l.widgetId)).toEqual(
      defaultLayout().map(l => l.widgetId),
    );
  });

  it('resolveLayout preserves saved order and appends new widgets', () => {
    // Only one saved pref; the rest should be appended (visible) in registry order.
    const saved = [{ widgetId: 'recurring', visible: false }];
    const resolved = resolveLayout(saved);
    expect(resolved[0]).toEqual({ widgetId: 'recurring', visible: false });
    expect(resolved).toHaveLength(WIDGETS.length);
    // appended ones are visible
    expect(resolved.slice(1).every(l => l.visible)).toBe(true);
  });

  it('resolveLayout drops unknown widget ids', () => {
    const resolved = resolveLayout([
      { widgetId: 'ghost', visible: true },
      { widgetId: 'recurring', visible: true },
    ]);
    expect(resolved.find(l => l.widgetId === 'ghost')).toBeUndefined();
  });
});

describe('InsightsScreen widget customization', () => {
  afterEach(() => _resetDatabaseSingleton());

  function seedShared() {
    const db = getDatabase();
    ItemsRepo.upsert(db, {
      itemId: 'i',
      accessToken: 'a',
      institutionName: 'Bank',
      syncCursor: null,
      createdAt: '',
    });
    AccountsRepo.upsert(db, {
      accountId: 'ac',
      itemId: 'i',
      name: 'Checking',
      officialName: null,
      mask: '0000',
      type: 'depository',
      subtype: 'checking',
      currentBalance: 1000,
      availableBalance: 1000,
      isoCurrency: 'USD',
      includeInNetWorth: true,
    });
    tx(db, 'a', '2026-03-01', 100, 'Groceries');
    return db;
  }

  it('renders widgets and shows the month comparison widget', async () => {
    seedShared();
    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('insights-pie')).toBeOnTheScreen();
    expect(screen.getByTestId('insights-comparison')).toBeOnTheScreen();
  });

  it('enters edit mode and hides a widget, persisting the choice', async () => {
    const db = seedShared();
    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );

    await user.press(screen.getByTestId('insights-edit-toggle'));
    expect(screen.getByTestId('insights-edit-list')).toBeOnTheScreen();

    // Toggle the recurring widget off.
    await user.press(screen.getByTestId('widget-toggle-recurring'));

    const prefs = WidgetPrefsRepo.all(db);
    const recurring = prefs.find(p => p.widgetId === 'recurring')!;
    expect(recurring.visible).toBe(false);
  });

  it('reorders widgets via the up/down controls', async () => {
    const db = seedShared();
    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <InsightsScreen />
      </AppDataProvider>,
    );
    await user.press(screen.getByTestId('insights-edit-toggle'));

    // Move the 2nd widget (month-comparison) up to position 0.
    await user.press(screen.getByTestId('widget-up-month-comparison'));

    const prefs = WidgetPrefsRepo.all(db);
    expect(prefs[0].widgetId).toBe('month-comparison');
  });
});
