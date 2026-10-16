import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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
import type { Account, AccountType } from '../types/models';
import { NetWorthChart } from '../components/NetWorthChart';

interface Section {
  title: string;
  subtotal: number;
  data: Account[];
}

/**
 * Map a Plaid account type to a display group. Order defines on-screen order;
 * a group only renders if it has ≥1 account.
 */
const GROUPS: { title: string; types: AccountType[] }[] = [
  { title: 'Cash', types: ['depository'] },
  { title: 'Credit', types: ['credit'] },
  { title: 'Loans', types: ['loan'] },
  { title: 'Investments', types: ['investment'] },
  { title: 'Other', types: ['other'] },
];

const LIABILITY_TYPES: AccountType[] = ['credit', 'loan'];

export function AccountsScreen() {
  const {
    db,
    version,
    linking,
    syncing,
    error,
    linkAccount,
    refresh,
    deleteAccount,
    setAccountIncluded,
  } = useAppData();

  // Account whose action sheet (include-toggle / delete) is open.
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);

  const { sections, netWorth, hasAccounts, institutionByItem } = useMemo(() => {
    const accounts: Account[] = AccountsRepo.all(db);
    const instMap = new Map<string, string>();
    ItemsRepo.all(db).forEach(it => instMap.set(it.itemId, it.institutionName));
    const byType = new Map<AccountType, Account[]>();
    accounts.forEach(a => {
      const list = byType.get(a.type) ?? [];
      list.push(a);
      byType.set(a.type, list);
    });

    const secs: Section[] = GROUPS.map(g => {
      const data = g.types.flatMap(t => byType.get(t) ?? []);
      const subtotal = data.reduce((sum, a) => sum + a.currentBalance, 0);
      return { title: g.title, subtotal, data };
    }).filter(s => s.data.length > 0);

    return {
      sections: secs,
      netWorth: AccountsRepo.netWorth(db),
      hasAccounts: accounts.length > 0,
      institutionByItem: instMap,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version]);

  if (!hasAccounts) {
    return (
      <ScreenContainer title="Accounts">
        <EmptyState
          testID="accounts-empty"
          title="No accounts yet"
          message="Link a bank account to see balances here."
          actionLabel={linking ? 'Opening Plaid…' : 'Link account'}
          onAction={linking ? undefined : linkAccount}
        />
      </ScreenContainer>
    );
  }

  // Net worth card + chart span the SAME width as the account rows (the list's
  // horizontal padding provides the inset; these have no extra margin).
  const header = (
    <View>
      <View style={styles.netWorthCard}>
        <Text style={styles.netWorthLabel}>Net worth</Text>
        <Text style={styles.netWorthValue}>{formatCurrency(netWorth)}</Text>
        {syncing ? (
          <ActivityIndicator color="#FFFFFF" style={styles.sync} />
        ) : null}
      </View>
      <NetWorthChart db={db} version={version} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <ScreenContainer title="Accounts">
      <SectionList
        sections={sections}
        keyExtractor={a => a.accountId}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View
            style={styles.sectionHeaderRow}
            testID={`accounts-group-${section.title}`}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            <Text style={styles.sectionSubtotal}>
              {formatCurrency(section.subtotal)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const institution = institutionByItem.get(item.itemId) ?? 'Account';
          const excluded = !item.includeInNetWorth;
          return (
            <TouchableOpacity
              style={[styles.row, excluded && styles.rowExcluded]}
              onPress={() => setActiveAccount(item)}
              testID={`account-row-${item.accountId}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {institution.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowLeft}>
                <Text style={styles.institution} numberOfLines={1}>
                  {institution}
                </Text>
                <Text style={styles.accountName}>{item.name}</Text>
                <Text style={styles.accountMeta}>
                  {item.subtype ?? item.type}
                  {item.mask ? ` ••${item.mask}` : ''}
                  {excluded ? '  ·  Not in net worth' : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.balance,
                  LIABILITY_TYPES.includes(item.type)
                    ? styles.liability
                    : undefined,
                ]}>
                {formatCurrency(item.currentBalance, item.isoCurrency)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Account actions: include-in-net-worth toggle + delete. */}
      <Modal
        visible={activeAccount != null}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveAccount(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setActiveAccount(null)}>
          <Pressable style={styles.sheet}>
            {activeAccount ? (
              <>
                <Text style={styles.sheetTitle}>{activeAccount.name}</Text>
                <Text style={styles.sheetSub}>
                  {institutionByItem.get(activeAccount.itemId) ?? ''}
                </Text>

                <TouchableOpacity
                  style={styles.sheetRow}
                  testID="account-toggle-networth"
                  onPress={() => {
                    setAccountIncluded(
                      activeAccount.accountId,
                      !activeAccount.includeInNetWorth,
                    );
                    setActiveAccount(null);
                  }}>
                  <Text style={styles.sheetRowText}>
                    {activeAccount.includeInNetWorth
                      ? 'Remove from net worth'
                      : 'Include in net worth'}
                  </Text>
                  <View
                    style={[
                      styles.pill,
                      activeAccount.includeInNetWorth
                        ? styles.pillOn
                        : styles.pillOff,
                    ]}>
                    <Text style={styles.pillText}>
                      {activeAccount.includeInNetWorth ? 'Counted' : 'Excluded'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetRow}
                  testID="account-delete"
                  onPress={() => {
                    const acc = activeAccount;
                    Alert.alert(
                      'Delete account?',
                      `This permanently removes "${acc.name}" and its transactions from the app. (It does not affect your bank.)`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            deleteAccount(acc.accountId);
                            setActiveAccount(null);
                          },
                        },
                      ],
                    );
                  }}>
                  <Text style={[styles.sheetRowText, styles.deleteText]}>
                    Delete account
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => setActiveAccount(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating actions: sync (left) + add (right), overlaid at the bottom. */}
      <TouchableOpacity
        style={[styles.fab, styles.fabLeft]}
        onPress={refresh}
        disabled={syncing}
        accessibilityLabel="Refresh / sync accounts"
        testID="accounts-refresh">
        {syncing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.fabIcon, styles.fabIconDark]}>⟳</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.fab, styles.fabRight]}
        onPress={linkAccount}
        disabled={linking}
        accessibilityLabel="Link another account"
        testID="accounts-link">
        {linking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.fabIcon}>+</Text>
        )}
      </TouchableOpacity>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  netWorthCard: {
    backgroundColor: colors.primary,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
  },
  netWorthLabel: { color: '#E7FFF4', fontSize: 14, fontWeight: '600' },
  netWorthValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  sync: { position: 'absolute', right: 16, top: 16 },
  // Full-width list: account rows inset only by this padding; the net worth
  // card + chart (in the header) share the same inset so they align edge-to-edge.
  listContent: { paddingHorizontal: 16, paddingBottom: 96 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtotal: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rowLeft: { flex: 1 },
  institution: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  accountName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  accountMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  liability: { color: colors.danger },
  error: { color: colors.danger, marginTop: 10, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  fabLeft: { left: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fabRight: { right: 20 },
  fabIcon: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  fabIconDark: { color: colors.textPrimary },
  rowExcluded: { opacity: 0.55 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  sheetSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetRowText: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  deleteText: { color: colors.danger },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillOn: { backgroundColor: colors.primary },
  pillOff: { backgroundColor: colors.textMuted },
  pillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  sheetCancel: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  sheetCancelText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
});
