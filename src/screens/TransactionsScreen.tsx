import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
  type TransactionFilter,
} from '../db/repositories';
import type { Category, Transaction } from '../types/models';

const UNCATEGORIZED_ID = -1;

/** Named time presets. `start` is computed relative to today; null = no bound. */
type TimeKey = 'ALL' | 'THIS_MONTH' | 'D30' | 'D90' | 'THIS_YEAR';
const TIME_PRESETS: { key: TimeKey; label: string }[] = [
  { key: 'ALL', label: 'All time' },
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'D30', label: 'Last 30 days' },
  { key: 'D90', label: 'Last 90 days' },
  { key: 'THIS_YEAR', label: 'This year' },
];

function timeStartDate(key: TimeKey, now = new Date()): string | undefined {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case 'THIS_MONTH':
      return iso(new Date(now.getFullYear(), now.getMonth(), 1));
    case 'THIS_YEAR':
      return iso(new Date(now.getFullYear(), 0, 1));
    case 'D30': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return iso(d);
    }
    case 'D90': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return iso(d);
    }
    case 'ALL':
    default:
      return undefined;
  }
}

export function TransactionsScreen() {
  const { db, version, bumpVersion } = useAppData();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Filter state (extensible: add more keys + UI as needed).
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set());
  const [timeKey, setTimeKey] = useState<TimeKey>('ALL');

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

  const filter: TransactionFilter = useMemo(() => {
    const f: TransactionFilter = {};
    if (selectedCats.size > 0) {
      f.categoryIds = [...selectedCats];
    }
    const start = timeStartDate(timeKey);
    if (start) {
      f.startDate = start;
    }
    return f;
  }, [selectedCats, timeKey]);

  const activeFilterCount =
    (selectedCats.size > 0 ? 1 : 0) + (timeKey !== 'ALL' ? 1 : 0);

  const transactions = useMemo<Transaction[]>(
    () => TransactionsRepo.list(db, { search, limit: 200, filter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, search, filter],
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

  const toggleCat = (id: number) =>
    setSelectedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const clearFilters = () => {
    setSelectedCats(new Set());
    setTimeKey('ALL');
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
          <View style={styles.searchRow}>
            <TextInput
              style={styles.search}
              placeholder="Search transactions"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              testID="tx-search"
            />
            <TouchableOpacity
              style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
              onPress={() => setFilterOpen(true)}
              testID="tx-filter-open">
              <Text
                style={[
                  styles.filterBtnText,
                  activeFilterCount > 0 && styles.filterBtnTextActive,
                ]}>
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={transactions}
            keyExtractor={t => t.transactionId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.noMatch} testID="tx-no-match">
                No transactions match your filters.
              </Text>
            }
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

          {/* Category picker (per-transaction). */}
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

          {/* Filter sheet: time presets + category multi-select. */}
          <Modal
            visible={filterOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setFilterOpen(false)}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setFilterOpen(false)}>
              <Pressable style={styles.filterSheet}>
                <View style={styles.filterHeader}>
                  <Text style={styles.modalTitle}>Filters</Text>
                  <TouchableOpacity onPress={clearFilters} testID="tx-filter-clear">
                    <Text style={styles.clearText}>Clear all</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView>
                  <Text style={styles.sectionLabel}>Time</Text>
                  <View style={styles.chipWrap}>
                    {TIME_PRESETS.map(p => (
                      <TouchableOpacity
                        key={p.key}
                        style={[
                          styles.chip,
                          timeKey === p.key && styles.chipOn,
                        ]}
                        onPress={() => setTimeKey(p.key)}
                        testID={`tx-time-${p.key}`}>
                        <Text
                          style={[
                            styles.chipText,
                            timeKey === p.key && styles.chipTextOn,
                          ]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>Categories</Text>
                  <View style={styles.chipWrap}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        selectedCats.has(UNCATEGORIZED_ID) && styles.chipOn,
                      ]}
                      onPress={() => toggleCat(UNCATEGORIZED_ID)}
                      testID="tx-cat-Uncategorized">
                      <Text
                        style={[
                          styles.chipText,
                          selectedCats.has(UNCATEGORIZED_ID) && styles.chipTextOn,
                        ]}>
                        Uncategorized
                      </Text>
                    </TouchableOpacity>
                    {categories.map(c => (
                      <TouchableOpacity
                        key={c.categoryId}
                        style={[
                          styles.chip,
                          selectedCats.has(c.categoryId) && styles.chipOn,
                        ]}
                        onPress={() => toggleCat(c.categoryId)}
                        testID={`tx-cat-${c.name}`}>
                        <Text
                          style={[
                            styles.chipText,
                            selectedCats.has(c.categoryId) && styles.chipTextOn,
                          ]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => setFilterOpen(false)}
                  testID="tx-filter-apply">
                  <Text style={styles.applyBtnText}>Show results</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBtnText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  filterBtnTextActive: { color: '#FFFFFF' },
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  noMatch: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 40,
  },
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
  filterSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF' },
  applyBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
