/**
 * Plaid configuration — EXAMPLE TEMPLATE.
 *
 * Copy this file to `plaid.config.ts` (which is gitignored) and fill in your
 * real Plaid credentials. NEVER commit real client_id / secret values.
 *
 *   cp plaid.config.example.ts plaid.config.ts
 *
 * SECURITY NOTE: This app embeds the Plaid secret in the client bundle for a
 * single-user, personal, local-first build. That is acceptable only because
 * the app is not distributed. Shipping these to anyone else would expose the
 * secret and must instead use a server-side token-exchange proxy.
 */
import type { PlaidConfig } from './src/plaid/config';

export const plaidConfig: PlaidConfig = {
  clientId: 'YOUR_PLAID_CLIENT_ID',
  secret: 'YOUR_PLAID_SECRET',
  // 'production' | 'sandbox'. This personal build targets production.
  env: 'production',
};
