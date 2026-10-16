/**
 * Maps Plaid `personal_finance_category.primary` values to the app's local
 * seed category names. Unknown values fall back to 'Uncategorized'.
 *
 * TRANSFERS / DEBT PAYMENTS → 'Transfer': internal money movement between the
 * user's own accounts and debt paydowns are NOT consumption spending, so they
 * map to 'Transfer', which every spending aggregation excludes. This prevents
 * double-counting, e.g.:
 *   • Paying a credit card (LOAN_PAYMENTS) — cash out of checking + the card
 *     balance going down is one internal movement, not new spending.
 *   • Moving checking → savings (TRANSFER_OUT / TRANSFER_IN).
 * Only `BANK_FEES` among the "money-ish" categories stays a real expense.
 */
const PFC_TO_LOCAL: Record<string, string> = {
  INCOME: 'Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  // Debt payments (incl. LOAN_PAYMENTS_CREDIT_CARD_PAYMENT, *_MORTGAGE_PAYMENT,
  // *_CAR_PAYMENT, *_STUDENT_LOAN_PAYMENT, *_PERSONAL_LOAN_PAYMENT) are internal
  // movements / debt reduction, not spending → Transfer.
  LOAN_PAYMENTS: 'Transfer',
  BANK_FEES: 'Fees & Charges',
  ENTERTAINMENT: 'Entertainment',
  FOOD_AND_DRINK: 'Food & Dining',
  GENERAL_MERCHANDISE: 'Shopping',
  HOME_IMPROVEMENT: 'Housing',
  MEDICAL: 'Health',
  PERSONAL_CARE: 'Health',
  GENERAL_SERVICES: 'Fees & Charges',
  GOVERNMENT_AND_NON_PROFIT: 'Fees & Charges',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  RENT_AND_UTILITIES: 'Utilities',
};

/**
 * Return the local category name for a Plaid personal-finance category.
 * Accepts either the `primary` ("LOAN_PAYMENTS") or a detailed value
 * ("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") — the detailed form is reduced to its
 * primary by matching the longest known prefix.
 */
export function mapPlaidCategory(primary: string | null | undefined): string {
  if (!primary) {
    return 'Uncategorized';
  }
  if (PFC_TO_LOCAL[primary]) {
    return PFC_TO_LOCAL[primary];
  }
  // Detailed value like "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": reduce to primary
  // by the LONGEST matching known prefix (so TRANSFER_IN beats TRANSFER, etc.).
  const key = Object.keys(PFC_TO_LOCAL)
    .filter(k => primary.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PFC_TO_LOCAL[key] : 'Uncategorized';
}
