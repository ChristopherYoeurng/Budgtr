/**
 * App-wide Plaid client singleton, bound to the real gitignored config.
 *
 * The config file (../../plaid.config) is gitignored and holds the production
 * credentials for this single-user build.
 */
import { createPlaidClient, type PlaidClient } from './client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { plaidConfig } from '../../plaid.config';

let client: PlaidClient | null = null;

export function getPlaidClient(): PlaidClient {
  if (!client) {
    client = createPlaidClient(plaidConfig);
  }
  return client;
}
