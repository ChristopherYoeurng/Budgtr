import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { formatCurrency } from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import {
  CategoriesRepo,
  TransactionsRepo,
} from '../db/repositories';
import type { Category, Transaction } from '../types/models';

export function TransactionsScreen() {
  const { db, version, bumpVersion } = useAppData();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const categories = useMemo<Category[]>(
    () => CategoriesRepo.all(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );
  const categoryName = useMemo(() => {
    const m = new Map<number, string>();
    categories.forEach(c => m.set(c.categoryId, c.name));
    return m;
  }, [categories]);

  const transactions = useMemo<Transaction[]>(
    () => TransactionsRepo.list(db, { search, limit: 200 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, search],
  );

  const anyTransactions = useMemo(
    () => TransactionsRepo.list(db, { limit: 1 }).length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const assignCategory = (categoryId: number | null) => {
    if (editing) {
      TransactionsRepo.setCategory(db, editing.transactionId, categoryId);
      setEditing(null);
      bumpVersion();
    }
  };

  return (
    <ScreenContainer title="Transactions">
      {!anyTransactions ? (
        <EmptyState
          testID="transactions-empty"
          title="No transactions yet"
          message="Link an account and sync to populate your feed."
        />
      ) : (
        <>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              placeholder="Search transactions"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              testID="tx-search"
            />
          </View>
          <FlatList
            data={transactions}
            keyExtractor={t => t.transactionId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => setEditing(item)}
                testID={`tx-${item.transactionId}`}>
                <View style={styles.rowLeft}>
                  <Text style={styles.txName} numberOfLines={1}>
                    {item.merchantName ?? item.name}
                  </Text>
                  <Text style={styles.txMeta}>
                    {item.date}
                    {' · '}
                    {item.categoryId != null
                      ? categoryName.get(item.categoryId) ?? 'Uncategorized'
                      : 'Uncategorized'}
                    {item.pending ? ' · Pending' : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.amount,
                    item.amount < 0 ? styles.inflow : undefined,
                  ]}>
                  {item.amount < 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(item.amount), item.isoCurrency)}
                </Text>
              </TouchableOpacity>
            )}
          />

          <Modal
            visible={editing != null}
            transparent
            animationType="slide"
            onRequestClose={() => setEditing(null)}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setEditing(null)}>
              <Pressable style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Choose category</Text>
                <FlatList
                  data={categories}
                  keyExtractor={c => String(c.categoryId)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.catRow}
                      onPress={() => assignCategory(item.categoryId)}
                      testID={`cat-${item.name}`}>
                      <Text style={styles.catName}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchWrap: { padding: 12 },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: {
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
  rowLeft: { flex: 1, marginRight: 12 },
  txName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  txMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  inflow: { color: colors.primary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  catRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catName: { fontSize: 16, color: colors.textPrimary },
});
