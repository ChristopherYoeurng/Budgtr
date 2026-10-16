/**
 * App data context: shares the SQLite handle and Plaid client with screens,
 * and exposes link/sync actions plus a `version` counter that screens watch to
 * re-query after data changes.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { getDatabase } from '../db/db';
import { getPlaidClient } from '../plaid';
import { openLinkAndPersist } from '../plaid/linking';
import { syncAll, syncItem } from '../plaid/sync';
import { ItemsRepo } from '../db/repositories';
import type { Database } from '../db/types';

interface AppDataValue {
  db: Database;
  /** Increments whenever underlying data changes; screens depend on it. */
  version: number;
  linking: boolean;
  syncing: boolean;
  error: string | null;
  linkAccount: () => Promise<void>;
  refresh: () => Promise<void>;
  bumpVersion: () => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const db = useMemo(() => getDatabase(), []);
  const client = useMemo(() => getPlaidClient(), []);
  const [version, setVersion] = useState(0);
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bumpVersion = useCallback(() => setVersion(v => v + 1), []);

  const linkAccount = useCallback(async () => {
    setError(null);
    setLinking(true);
    try {
      const itemId = await openLinkAndPersist({
        db,
        client,
        userId: 'local-user',
        onError: setError,
      });
      bumpVersion();
      if (itemId) {
        // Initial sync for the just-linked item.
        setSyncing(true);
        const item = ItemsRepo.all(db).find(i => i.itemId === itemId);
        if (item) {
          await syncItem(db, client, item.itemId, item.accessToken);
        }
        bumpVersion();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Linking failed');
    } finally {
      setLinking(false);
      setSyncing(false);
    }
  }, [db, client, bumpVersion]);

  const refresh = useCallback(async () => {
    setError(null);
    setSyncing(true);
    try {
      await syncAll(db, client);
      bumpVersion();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [db, client, bumpVersion]);

  const value = useMemo(
    () => ({
      db,
      version,
      linking,
      syncing,
      error,
      linkAccount,
      refresh,
      bumpVersion,
    }),
    [db, version, linking, syncing, error, linkAccount, refresh, bumpVersion],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return ctx;
}
