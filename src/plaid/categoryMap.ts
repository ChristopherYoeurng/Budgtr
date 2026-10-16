/**
 * Maps Plaid `personal_finance_category.primary` values to the app's local
 * seed category names. Unknown values fall back to 'Uncategorized'.
 */
const PFC_TO_LOCAL: Record<string, string> = {
  INCOME: 'Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  LOAN_PAYMENTS: 'Fees & Charges',
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

/** Return the local category name for a Plaid PFC primary (or Uncategorized). */
export function mapPlaidCategory(primary: string | null | undefined): string {
  if (!primary) {
    return 'Uncategorized';
  }
  return PFC_TO_LOCAL[primary] ?? 'Uncategorized';
}
