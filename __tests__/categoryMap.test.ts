/**
 * Tests for Plaid category mapping — ensures transfers and debt payments are
 * classified as 'Transfer' (excluded from spending), preventing double-counting.
 */
import { mapPlaidCategory } from '../src/plaid/categoryMap';

describe('mapPlaidCategory', () => {
  it('maps account-to-account transfers to Transfer', () => {
    expect(mapPlaidCategory('TRANSFER_IN')).toBe('Transfer');
    expect(mapPlaidCategory('TRANSFER_OUT')).toBe('Transfer');
  });

  it('maps credit-card and loan payments to Transfer (not spending)', () => {
    expect(mapPlaidCategory('LOAN_PAYMENTS')).toBe('Transfer');
    // Detailed PFC values reduce to their primary.
    expect(mapPlaidCategory('LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')).toBe(
      'Transfer',
    );
    expect(mapPlaidCategory('LOAN_PAYMENTS_MORTGAGE_PAYMENT')).toBe('Transfer');
    expect(mapPlaidCategory('LOAN_PAYMENTS_CAR_PAYMENT')).toBe('Transfer');
  });

  it('reduces detailed transfer values to Transfer (longest-prefix match)', () => {
    expect(mapPlaidCategory('TRANSFER_IN_DEPOSIT')).toBe('Transfer');
    expect(mapPlaidCategory('TRANSFER_OUT_WITHDRAWAL')).toBe('Transfer');
  });

  it('keeps real spending categories as spending', () => {
    expect(mapPlaidCategory('FOOD_AND_DRINK')).toBe('Food & Dining');
    expect(mapPlaidCategory('GENERAL_MERCHANDISE')).toBe('Shopping');
    expect(mapPlaidCategory('GENERAL_SERVICES')).toBe('Fees & Charges');
    expect(mapPlaidCategory('BANK_FEES')).toBe('Fees & Charges');
    expect(mapPlaidCategory('INCOME')).toBe('Income');
  });

  it('falls back to Uncategorized for null / unknown', () => {
    expect(mapPlaidCategory(null)).toBe('Uncategorized');
    expect(mapPlaidCategory(undefined)).toBe('Uncategorized');
    expect(mapPlaidCategory('SOMETHING_NEW')).toBe('Uncategorized');
  });
});
