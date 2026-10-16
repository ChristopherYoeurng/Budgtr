/**
 * Tests for Month comparison widget interactions:
 * - tapping a bar/point shows its value (SelectionReadout)
 * - hiding a category moves it to an "add back" list and off the chart
 * - re-adding a hidden category restores it
 * - the line variant renders
 *
 * Uses the shared getDatabase() singleton (see CLAUDE.md: avoid generic-arrow
 * makeDb in .tsx test files).
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { getDatabase, _resetDatabaseSingleton } from '../src/db/db';
import {
  AccountsRepo,
  CategoriesRepo,
  ItemsRepo,
  TransactionsRepo,
} from '../src/db/repositories';
import { AppDataProvider } from '../src/context/AppDataContext';
import { MonthComparisonWidget } from '../src/components/widgets/MonthComparisonWidget';
import { MonthComparisonLineWidget } from '../src/components/widgets/MonthComparisonLineWidget';
import { SelectionReadout } from '../src/components/widgets/comparisonParts';
import { currentMonthKey, shiftMonth } from '../src/utils/format';

jest.useFakeTimers();
afterEach(() => _resetDatabaseSingleton());

const THIS_MONTH = currentMonthKey();
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);

function seed() {
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
  const groceries = CategoriesRepo.findByName(db, 'Groceries')!.categoryId;
  const dining = CategoriesRepo.findByName(db, 'Restaurants')!.categoryId;
  // Current month spend
  TransactionsRepo.upsert(db, {
    transactionId: 'g-now',
    accountId: 'ac',
    date: `${THIS_MONTH}-04`,
    name: 'Market',
    merchantName: 'Market',
    amount: 120,
    pending: false,
    categoryId: groceries,
    isoCurrency: 'USD',
  });
  TransactionsRepo.upsert(db, {
    transactionId: 'd-now',
    accountId: 'ac',
    date: `${THIS_MONTH}-06`,
    name: 'Diner',
    merchantName: 'Diner',
    amount: 45,
    pending: false,
    categoryId: dining,
    isoCurrency: 'USD',
  });
  // Last month spend (for comparison target)
  TransactionsRepo.upsert(db, {
    transactionId: 'g-prev',
    accountId: 'ac',
    date: `${LAST_MONTH}-04`,
    name: 'Market',
    merchantName: 'Market',
    amount: 80,
    pending: false,
    categoryId: groceries,
    isoCurrency: 'USD',
  });
  return db;
}

describe('SelectionReadout (tap-to-see-value display)', () => {
  it('shows the hint when nothing is selected', async () => {
    await render(<SelectionReadout selection={null} />);
    expect(screen.getByTestId('comparison-selection-hint')).toBeOnTheScreen();
  });

  it('shows the category, month, and formatted value when selected', async () => {
    await render(
      <SelectionReadout
        selection={{ categoryName: 'Groceries', month: '2026-03', value: 120 }}
      />,
    );
    expect(screen.getByTestId('comparison-selection')).toBeOnTheScreen();
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    expect(screen.getByText(/March 2026: \$120\.00/)).toBeOnTheScreen();
  });
});

describe('MonthComparisonWidget (bars)', () => {
  it('renders the bar chart and category chips', async () => {
    seed();
    await render(
      <AppDataProvider>
        <MonthComparisonWidget db={getDatabase()} version={0} month={THIS_MONTH} />
      </AppDataProvider>,
    );
    // Bar tap shows a floating tooltip (renderTooltip, driven by gifted-charts
    // focusBarOnPress — not simulable here). Assert the chart + chips render.
    expect(screen.getByTestId('insights-comparison')).toBeOnTheScreen();
    expect(screen.getByTestId('comparison-hide-Groceries')).toBeOnTheScreen();
  });

  it('hides a category (moves to add-back list) and restores it', async () => {
    seed();
    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <MonthComparisonWidget db={getDatabase()} version={0} month={THIS_MONTH} />
      </AppDataProvider>,
    );

    // Both categories visible initially -> hide chips present.
    expect(screen.getByTestId('comparison-hide-Groceries')).toBeOnTheScreen();
    expect(screen.getByTestId('comparison-hide-Restaurants')).toBeOnTheScreen();

    // Hide Groceries.
    await user.press(screen.getByTestId('comparison-hide-Groceries'));

    // Now a "show" chip should exist for Groceries, and no "hide" chip.
    expect(screen.getByTestId('comparison-show-Groceries')).toBeOnTheScreen();
    expect(screen.queryByTestId('comparison-hide-Groceries')).toBeNull();

    // Re-add Groceries.
    await user.press(screen.getByTestId('comparison-show-Groceries'));
    expect(screen.getByTestId('comparison-hide-Groceries')).toBeOnTheScreen();
    expect(screen.queryByTestId('comparison-show-Groceries')).toBeNull();
  });

  it('opens the month dropdown and switches the comparison month', async () => {
    seed();
    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <MonthComparisonWidget db={getDatabase()} version={0} month={THIS_MONTH} />
      </AppDataProvider>,
    );
    await user.press(screen.getByTestId('comparison-month-dropdown'));
    // LAST_MONTH has data and is selectable.
    expect(screen.getByTestId(`comparison-month-${LAST_MONTH}`)).toBeOnTheScreen();
    await user.press(screen.getByTestId(`comparison-month-${LAST_MONTH}`));
    // Still rendering after selection.
    expect(screen.getByTestId('insights-comparison')).toBeOnTheScreen();
  });
});

describe('MonthComparisonLineWidget (lines)', () => {
  it('renders the line comparison with category chips', async () => {
    seed();
    await render(
      <AppDataProvider>
        <MonthComparisonLineWidget
          db={getDatabase()}
          version={0}
          month={THIS_MONTH}
        />
      </AppDataProvider>,
    );
    expect(screen.getByTestId('insights-comparison-line')).toBeOnTheScreen();
    expect(screen.getByTestId('comparison-hide-Groceries')).toBeOnTheScreen();
  });

  it('hides and restores a category on the line variant', async () => {
    seed();
    const user = userEvent.setup();
    await render(
      <AppDataProvider>
        <MonthComparisonLineWidget
          db={getDatabase()}
          version={0}
          month={THIS_MONTH}
        />
      </AppDataProvider>,
    );
    await user.press(screen.getByTestId('comparison-hide-Restaurants'));
    expect(screen.getByTestId('comparison-show-Restaurants')).toBeOnTheScreen();
    await user.press(screen.getByTestId('comparison-show-Restaurants'));
    expect(screen.getByTestId('comparison-hide-Restaurants')).toBeOnTheScreen();
  });
});
