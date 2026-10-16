/**
 * Domain model types shared across the data layer, repositories, and UI.
 * These mirror the SQLite schema defined in src/db/migrations.
 */

export interface Item {
  itemId: string;
  accessToken: string;
  institutionName: string;
  syncCursor: string | null;
  createdAt: string;
}

export type AccountType =
  | 'depository'
  | 'credit'
  | 'loan'
  | 'investment'
  | 'other';

export interface Account {
  accountId: string;
  itemId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: AccountType;
  subtype: string | null;
  currentBalance: number;
  availableBalance: number | null;
  isoCurrency: string;
}

export interface Transaction {
  transactionId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  name: string;
  merchantName: string | null;
  amount: number; // Plaid convention: positive = money out, negative = money in
  pending: boolean;
  categoryId: number | null;
  isoCurrency: string;
}

export interface Category {
  categoryId: number;
  name: string;
  parent: string | null;
  isCustom: boolean;
}

export interface Budget {
  budgetId: number;
  categoryId: number;
  month: string; // YYYY-MM
  limitAmount: number;
}

/** Aggregation result: total spend for a single category. */
export interface CategorySpend {
  categoryId: number | null;
  categoryName: string;
  total: number;
}

/** Aggregation result: total spend for a single month. */
export interface MonthSpend {
  month: string; // YYYY-MM
  total: number;
}

/** Aggregation result: budget limit vs actual spend for a category. */
export interface BudgetProgress {
  budgetId: number;
  categoryId: number;
  categoryName: string;
  month: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  overBudget: boolean;
}

export type RecurringFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'SEMI_MONTHLY'
  | 'MONTHLY'
  | 'ANNUALLY'
  | 'UNKNOWN';

export type RecurringDirection = 'inflow' | 'outflow';

/** A point in the net-worth history (one snapshot per day). */
export interface NetWorthPoint {
  date: string; // YYYY-MM-DD
  netWorth: number;
}

/** A detected recurring transaction stream (bill or income). */
export interface RecurringStream {
  streamId: string;
  description: string;
  merchantName: string | null;
  direction: RecurringDirection;
  frequency: RecurringFrequency;
  lastAmount: number;
  averageAmount: number;
  lastDate: string; // YYYY-MM-DD
  nextDate: string | null; // estimated YYYY-MM-DD
  isActive: boolean;
  source: 'plaid' | 'heuristic';
}
