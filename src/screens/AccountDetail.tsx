import React, { useMemo, useState } from 'react';
import {
  Alert,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { formatCurrency } from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import {
  AccountsRepo,
  CategoriesRepo,
  TransactionsRepo,
} from '../db/repositories';
import type { Account, Transaction } from '../types/models';
import { BalanceChart } from '../components/BalanceChart';

interface Props {
  account: Account;
  institution: string;
  onClose: () => void;
}

interface TxSection {
  title: string;
  data: Transaction[];
}

export function AccountDetail({ account, institution, onClose }: Props) {
  const { db, version, deleteAccount, setAccountIncluded } = useAppData();
  // When a transaction is tapped, pin the chart's highlight to its date.
  const [highlightDate, setHighlightDate] = useState<string | null>(null);

  const history = useMemo(
    () => AccountsRepo.balanceHistory(db, account.accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, account.accountId],
  );

  const categoryName = useMemo(() => {
    const m = new Map<number, string>();
    CategoriesRepo.all(db).forEach(c => m.set(c.categoryId, c.name));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version]);

  const sections = useMemo<TxSection[]>(() => {
    const all = TransactionsRepo.list(db, {
      limit: 500,
      // reuse the list filter; account scoping done client-side below since
      // filter has no accountId yet (kept minimal/extensible).
    }).filter(t => t.accountId === account.accountId);
    const pending = all.filter(t => t.pending);
    const posted = all.filter(t => !t.pending);
    const secs: TxSection[] = [];
    if (pending.length) {
      secs.push({ title: 'Pending', data: pending });
    }
    if (posted.length) {
      secs.push({ title: 'Posted', data: posted });
    }
    return secs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, account.accountId]);

  const isLiability = account.type === 'credit' || account.type === 'loan';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} testID="account-detail-close">
          <Text style={styles.close}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {account.name}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={t => t.transactionId}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.balanceCard}>
              <Text style={styles.institution}>{institution}</Text>
              <Text style={styles.balanceLabel}>
                {isLiability ? 'Balance owed' : 'Balance'}
              </Text>
              <Text
                style={[
                  styles.balanceValue,
                  isLiability && styles.liabilityValue,
                ]}>
                {formatCurrency(account.currentBalance, account.isoCurrency)}
              </Text>
            </View>

            <View style={styles.chartCard}>
              <BalanceChart
                points={history}
                height={170}
                highlightDate={highlightDate}
                testID="account-chart"
                insufficientMessage="Not enough transaction history to chart this account yet."
              />
            </View>

            <Text style={styles.sectionIntro}>Transactions</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.noTx} testID="account-detail-no-tx">
            No transactions for this account yet.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={styles.sectionHeader}
            testID={`account-tx-section-${section.title}`}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const active = highlightDate === item.date;
          return (
            <TouchableOpacity
              style={[styles.txRow, active && styles.txRowActive]}
              onPress={() =>
                setHighlightDate(prev => (prev === item.date ? null : item.date))
              }
              testID={`account-tx-${item.transactionId}`}>
              <View style={styles.txLeft}>
                <Text style={styles.txName} numberOfLines={1}>
                  {item.merchantName ?? item.name}
                </Text>
                <Text style={styles.txMeta}>
                  {item.date}
                  {' · '}
                  {item.categoryId != null
                    ? categoryName.get(item.categoryId) ?? 'Uncategorized'
                    : 'Uncategorized'}
                </Text>
              </View>
              <Text
                style={[styles.txAmount, item.amount < 0 && styles.inflow]}>
                {item.amount < 0 ? '+' : '-'}
                {formatCurrency(Math.abs(item.amount), item.isoCurrency)}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              testID="account-toggle-networth"
              onPress={() => {
                setAccountIncluded(account.accountId, !account.includeInNetWorth);
                onClose();
              }}>
              <Text style={styles.actionText}>
                {account.includeInNetWorth
                  ? 'Remove from net worth'
                  : 'Include in net worth'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              testID="account-delete"
              onPress={() =>
                Alert.alert(
                  'Delete account?',
                  `This permanently removes "${account.name}" and its transactions from the app. (It does not affect your bank.)`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        deleteAccount(account.accountId);
                        onClose();
                      },
                    },
                  ],
                )
              }>
              <Text style={[styles.actionText, styles.deleteText]}>
                Delete account
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  close: { color: colors.primary, fontSize: 16, fontWeight: '700', width: 50 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  content: { padding: 16, paddingBottom: 32 },
  balanceCard: { alignItems: 'center', marginBottom: 16 },
  institution: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  balanceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  liabilityValue: { color: colors.danger },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionIntro: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 22,
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  noTx: { color: colors.textMuted, fontSize: 14, paddingVertical: 16 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  txRowActive: { borderColor: colors.warning, borderWidth: 1.5 },
  txLeft: { flex: 1, marginRight: 12 },
  txName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  txMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  txAmount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  inflow: { color: colors.primary },
  actions: { marginTop: 20 },
  actionBtn: {
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  deleteText: { color: colors.danger },
});
