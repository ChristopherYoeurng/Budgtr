import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { formatCurrency } from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import { AccountsRepo, ItemsRepo } from '../db/repositories';
import type { Account, Item } from '../types/models';

interface Section {
  title: string;
  data: Account[];
}

export function AccountsScreen() {
  const { db, version, linking, syncing, error, linkAccount, refresh } =
    useAppData();

  const { sections, netWorth, hasAccounts } = useMemo(() => {
    const items: Item[] = ItemsRepo.all(db);
    const accounts: Account[] = AccountsRepo.all(db);
    const byItem = new Map<string, Account[]>();
    accounts.forEach(a => {
      const list = byItem.get(a.itemId) ?? [];
      list.push(a);
      byItem.set(a.itemId, list);
    });
    const secs: Section[] = items
      .map(it => ({
        title: it.institutionName,
        data: byItem.get(it.itemId) ?? [],
      }))
      .filter(s => s.data.length > 0);
    return {
      sections: secs,
      netWorth: AccountsRepo.netWorth(db),
      hasAccounts: accounts.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version]);

  return (
    <ScreenContainer title="Accounts">
      {!hasAccounts ? (
        <EmptyState
          testID="accounts-empty"
          title="No accounts yet"
          message="Link a bank account to see balances here."
          actionLabel={linking ? 'Opening Plaid…' : 'Link account'}
          onAction={linking ? undefined : linkAccount}
        />
      ) : (
        <>
          <View style={styles.netWorthCard}>
            <Text style={styles.netWorthLabel}>Net worth</Text>
            <Text style={styles.netWorthValue}>{formatCurrency(netWorth)}</Text>
            {syncing ? (
              <ActivityIndicator color={colors.primary} style={styles.sync} />
            ) : null}
          </View>

          <SectionList
            sections={sections}
            keyExtractor={a => a.accountId}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.accountName}>{item.name}</Text>
                  <Text style={styles.accountMeta}>
                    {item.subtype ?? item.type}
                    {item.mask ? ` ••${item.mask}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.balance,
                    item.type === 'credit' || item.type === 'loan'
                      ? styles.liability
                      : undefined,
                  ]}>
                  {formatCurrency(item.currentBalance, item.isoCurrency)}
                </Text>
              </View>
            )}
          />

          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={refresh}
                disabled={syncing}
                testID="accounts-refresh">
                <Text style={styles.btnSecondaryText}>
                  {syncing ? 'Syncing…' : 'Refresh'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btn}
                onPress={linkAccount}
                disabled={linking}
                testID="accounts-link">
                <Text style={styles.btnText}>
                  {linking ? 'Opening…' : 'Link another'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  netWorthCard: {
    backgroundColor: colors.primary,
    margin: 16,
    borderRadius: 16,
    padding: 20,
  },
  netWorthLabel: { color: '#E7FFF4', fontSize: 14, fontWeight: '600' },
  netWorthValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 4,
  },
  sync: { position: 'absolute', right: 16, top: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 8 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowLeft: { flex: 1 },
  accountName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  accountMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  liability: { color: colors.danger },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  error: { color: colors.danger, marginBottom: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontWeight: '700' },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: { color: colors.textPrimary, fontWeight: '700' },
});
