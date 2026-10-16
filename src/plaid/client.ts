/**
 * Thin Plaid REST client.
 *
 * Wraps the handful of endpoints this local-first app needs. Credentials come
 * from the gitignored `plaid.config.ts` at the project root. The client_id and
 * secret are attached to every request body (Plaid's auth scheme for the REST
 * API).
 *
 * SECURITY: embedding the secret client-side is acceptable only for this
 * single-user personal build. Do not distribute the app with real credentials.
 */
import { plaidBaseUrl, type PlaidConfig } from './config';

// ---- Response shapes (only the fields we consume) -------------------------

export interface PlaidAccountBalance {
  current: number | null;
  available: number | null;
  iso_currency_code: string | null;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: PlaidAccountBalance;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  pending: boolean;
  iso_currency_code: string | null;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
  category?: string[] | null;
}

export interface LinkTokenCreateResponse {
  link_token: string;
  expiration: string;
}

export interface ItemPublicTokenExchangeResponse {
  access_token: string;
  item_id: string;
}

export interface AccountsGetResponse {
  accounts: PlaidAccount[];
  item: { item_id: string; institution_id: string | null };
}

export interface TransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
}

export interface PlaidRecurringStream {
  stream_id: string;
  description: string;
  merchant_name: string | null;
  frequency: string; // WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY | UNKNOWN
  last_amount: { amount: number; iso_currency_code: string | null };
  average_amount: { amount: number; iso_currency_code: string | null };
  last_date: string;
  is_active: boolean;
  status: string;
}

export interface TransactionsRecurringGetResponse {
  inflow_streams: PlaidRecurringStream[];
  outflow_streams: PlaidRecurringStream[];
}

export class PlaidError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlaidError';
  }
}

/** Factory producing a client bound to a config (DI-friendly for tests). */
export function createPlaidClient(
  config: PlaidConfig,
  fetchImpl: typeof fetch = fetch,
) {
  const baseUrl = plaidBaseUrl(config.env);

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        secret: config.secret,
        ...body,
      }),
    });

    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new PlaidError(
        (json.error_message as string) || `Plaid request failed: ${path}`,
        json.error_code as string | undefined,
        res.status,
      );
    }
    return json as T;
  }

  return {
    /** Create a link_token to initialize Plaid Link for this device/user. */
    createLinkToken(userId: string): Promise<LinkTokenCreateResponse> {
      return post<LinkTokenCreateResponse>('/link/token/create', {
        user: { client_user_id: userId },
        client_name: 'Budget',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      });
    },

    /** Exchange a public_token (from Link onSuccess) for an access_token. */
    exchangePublicToken(
      publicToken: string,
    ): Promise<ItemPublicTokenExchangeResponse> {
      return post<ItemPublicTokenExchangeResponse>(
        '/item/public_token/exchange',
        { public_token: publicToken },
      );
    },

    /** Fetch accounts + balances for a linked item. */
    getAccounts(accessToken: string): Promise<AccountsGetResponse> {
      return post<AccountsGetResponse>('/accounts/get', {
        access_token: accessToken,
      });
    },

    /** One page of incremental transaction updates. */
    transactionsSync(
      accessToken: string,
      cursor: string | null,
    ): Promise<TransactionsSyncResponse> {
      return post<TransactionsSyncResponse>('/transactions/sync', {
        access_token: accessToken,
        cursor: cursor ?? undefined,
        count: 500,
      });
    },

    /** Fetch Plaid-detected recurring inflow/outflow streams for an item. */
    transactionsRecurringGet(
      accessToken: string,
    ): Promise<TransactionsRecurringGetResponse> {
      return post<TransactionsRecurringGetResponse>(
        '/transactions/recurring/get',
        { access_token: accessToken },
      );
    },
  };
}

export type PlaidClient = ReturnType<typeof createPlaidClient>;
