/**
 * Plaid configuration types and environment helpers.
 *
 * The actual credential values live in the gitignored `plaid.config.ts` at the
 * project root (created from `plaid.config.example.ts`). This module only
 * defines the shape and the base-URL mapping.
 */

export type PlaidEnv = 'sandbox' | 'production';

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
}

/** Map a Plaid environment to its API base URL. */
export function plaidBaseUrl(env: PlaidEnv): string {
  switch (env) {
    case 'production':
      return 'https://production.plaid.com';
    case 'sandbox':
    default:
      return 'https://sandbox.plaid.com';
  }
}
