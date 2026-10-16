/**
 * Account-linking service.
 *
 * Orchestrates the Plaid Link v13 flow and persists the resulting Item and
 * Accounts into SQLite. The persistence step (`persistLinkedItem`) is separated
 * from the native session so it can be unit-tested without the native SDK.
 */
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk';
import type { Database } from '../db/types';
import { AccountsRepo, ItemsRepo } from '../db/repositories';
import type { AccountType } from '../types/models';
import type { PlaidClient, PlaidAccount } from './client';

/** Metadata we read off the Link onSuccess payload. */
export interface LinkSuccessMetadata {
  institution?: { name?: string | null } | null;
}

const VALID_TYPES: AccountType[] = [
  'depository',
  'credit',
  'loan',
  'investment',
];

function normalizeType(t: string): AccountType {
  return (VALID_TYPES as string[]).includes(t) ? (t as AccountType) : 'other';
}

/** Map a Plaid account payload to our Account row shape. */
export function mapPlaidAccount(
  a: PlaidAccount,
  itemId: string,
): import('../types/models').Account {
  return {
    accountId: a.account_id,
    itemId,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type: normalizeType(a.type),
    subtype: a.subtype ?? null,
    currentBalance: a.balances?.current ?? 0,
    availableBalance: a.balances?.available ?? null,
    isoCurrency: a.balances?.iso_currency_code ?? 'USD',
    includeInNetWorth: true,
  };
}

/**
 * Exchange the public token, fetch accounts, and persist Item + Accounts.
 * Returns the created itemId. Pure w.r.t. the native SDK (testable).
 */
export async function persistLinkedItem(
  db: Database,
  client: PlaidClient,
  publicToken: string,
  institutionName: string,
): Promise<string> {
  const { access_token, item_id } = await client.exchangePublicToken(
    publicToken,
  );
  const { accounts } = await client.getAccounts(access_token);

  db.transaction(() => {
    ItemsRepo.upsert(db, {
      itemId: item_id,
      accessToken: access_token,
      institutionName,
      syncCursor: null,
      createdAt: '',
    });
    for (const a of accounts) {
      AccountsRepo.upsert(db, mapPlaidAccount(a, item_id));
    }
  });

  return item_id;
}

/**
 * Open Plaid Link (v13 session API) and persist on success.
 *
 * @returns the linked itemId, or null if the user exited without linking.
 */
export async function openLinkAndPersist(params: {
  db: Database;
  client: PlaidClient;
  userId: string;
  onError?: (message: string) => void;
}): Promise<string | null> {
  const { db, client, userId, onError } = params;

  const { link_token } = await client.createLinkToken(userId);

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    createPlaidLinkSession({
      token: link_token,
      onSuccess: async (success: {
        publicToken: string;
        metadata: LinkSuccessMetadata;
      }) => {
        try {
          const institutionName =
            success.metadata?.institution?.name ?? 'Unknown Institution';
          const itemId = await persistLinkedItem(
            db,
            client,
            success.publicToken,
            institutionName,
          );
          finish(itemId);
        } catch (e) {
          onError?.(e instanceof Error ? e.message : 'Failed to link account');
          finish(null);
        }
      },
      onExit: (exit: { error?: unknown }) => {
        if (exit?.error) {
          onError?.('Link exited with an error');
        }
        finish(null);
      },
      onEvent: () => undefined,
    })
      .then((session) => session.open())
      .catch((e: unknown) => {
        onError?.(e instanceof Error ? e.message : 'Could not open Plaid Link');
        finish(null);
      });
  });
}
