/**
 * Plaid client tests — mocked fetch, no network. Verifies endpoints, request
 * payloads (incl. credential injection), response parsing, and error handling.
 */
import { createPlaidClient, PlaidError } from '../src/plaid/client';
import type { PlaidConfig } from '../src/plaid/config';

const config: PlaidConfig = {
  clientId: 'test_client',
  secret: 'test_secret',
  env: 'production',
};

function mockFetch(status: number, body: unknown) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('createPlaidClient', () => {
  it('hits production base URL and injects credentials', async () => {
    const fetchImpl = mockFetch(200, {
      link_token: 'link-123',
      expiration: '2026-01-01',
    });
    const client = createPlaidClient(config, fetchImpl);
    const res = await client.createLinkToken('user_1');

    expect(res.link_token).toBe('link-123');
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe('https://production.plaid.com/link/token/create');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.client_id).toBe('test_client');
    expect(sentBody.secret).toBe('test_secret');
    expect(sentBody.products).toContain('transactions');
    expect(sentBody.user.client_user_id).toBe('user_1');
  });

  it('exchanges a public token', async () => {
    const fetchImpl = mockFetch(200, {
      access_token: 'access-xyz',
      item_id: 'item-1',
    });
    const client = createPlaidClient(config, fetchImpl);
    const res = await client.exchangePublicToken('public-abc');
    expect(res.access_token).toBe('access-xyz');
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toContain('/item/public_token/exchange');
    expect(JSON.parse((init as RequestInit).body as string).public_token).toBe(
      'public-abc',
    );
  });

  it('fetches accounts', async () => {
    const fetchImpl = mockFetch(200, {
      accounts: [
        {
          account_id: 'a1',
          name: 'Checking',
          official_name: null,
          mask: '0000',
          type: 'depository',
          subtype: 'checking',
          balances: { current: 100, available: 90, iso_currency_code: 'USD' },
        },
      ],
      item: { item_id: 'item-1', institution_id: 'ins_1' },
    });
    const client = createPlaidClient(config, fetchImpl);
    const res = await client.getAccounts('access-xyz');
    expect(res.accounts).toHaveLength(1);
    expect(res.accounts[0].balances.current).toBe(100);
  });

  it('parses transactions/sync added/modified/removed + cursor', async () => {
    const fetchImpl = mockFetch(200, {
      added: [{ transaction_id: 't1', account_id: 'a1', amount: 10 }],
      modified: [],
      removed: [{ transaction_id: 't0' }],
      next_cursor: 'cursor-2',
      has_more: false,
    });
    const client = createPlaidClient(config, fetchImpl);
    const res = await client.transactionsSync('access-xyz', 'cursor-1');
    expect(res.added).toHaveLength(1);
    expect(res.removed[0].transaction_id).toBe('t0');
    expect(res.next_cursor).toBe('cursor-2');
    expect(res.has_more).toBe(false);
    const sentBody = JSON.parse(
      (fetchImpl as jest.Mock).mock.calls[0][1].body,
    );
    expect(sentBody.cursor).toBe('cursor-1');
  });

  it('throws PlaidError with code on non-2xx responses', async () => {
    const fetchImpl = mockFetch(400, {
      error_code: 'INVALID_ACCESS_TOKEN',
      error_message: 'the provided access token is invalid',
    });
    const client = createPlaidClient(config, fetchImpl);
    await expect(client.getAccounts('bad')).rejects.toMatchObject({
      name: 'PlaidError',
      code: 'INVALID_ACCESS_TOKEN',
      status: 400,
    });
    await expect(client.getAccounts('bad')).rejects.toBeInstanceOf(PlaidError);
  });
});
