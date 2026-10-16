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
import { colors } from '../theme/colors';
import {
  currentMonthKey,
  formatCurrency,
  monthLabel,
  shiftMonth,
} from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import {
  BudgetsRepo,
  CategoriesRepo,
  budgetProgress,
} from '../db/repositories';
import type { BudgetProgress, Category } from '../types/models';

export function BudgetsScreen() {
  const { db, version, bumpVersion } = useAppData();
  const [month, setMonth] = useState(currentMonthKey());
  const [picking, setPicking] = useState(false);
  const [limitInput, setLimitInput] = useState('');
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);

  const progress = useMemo<BudgetProgress[]>(
    () => budgetProgress(db, month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month],
  );
  const categories = useMemo<Category[]>(
    () => CategoriesRepo.all(db).filter(c => c.name !== 'Income' && c.name !== 'Transfer'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const saveLimit = () => {
    const amount = parseFloat(limitInput);
    if (selectedCat && !Number.isNaN(amount) && amount > 0) {
      BudgetsRepo.setLimit(db, selectedCat.categoryId, month, amount);
      bumpVersion();
    }
    setPicking(false);
    setSelectedCat(null);
    setLimitInput('');
  };

  return (
    <ScreenContainer title="Budgets">
      <View style={styles.monthBar}>
        <TouchableOpacity
          onPress={() => setMonth(m => shiftMonth(m, -1))}
          testID="budget-prev-month">
          <Text style={styles.monthArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity
          onPress={() => setMonth(m => shiftMonth(m, 1))}
          testID="budget-next-month">
          <Text style={styles.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {progress.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No budgets for this month</Text>
          <Text style={styles.emptyMsg}>
            Set a monthly limit per category to track your spending.
          </Text>
        </View>
      ) : (
        <FlatList
          data={progress}
          keyExtractor={p => String(p.budgetId)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const pct = Math.min(
              100,
              item.limitAmount > 0
                ? (item.spent / item.limitAmount) * 100
                : 0,
            );
            return (
              <View style={styles.card} testID={`budget-${item.categoryName}`}>
                <View style={styles.cardHeader}>
                  <Text style={styles.catName}>{item.categoryName}</Text>
                  <Text
                    style={[
                      styles.amounts,
                      item.overBudget ? styles.over : undefined,
                    ]}>
                    {formatCurrency(item.spent)} / {formatCurrency(item.limitAmount)}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${pct}%` },
                      item.overBudget ? styles.fillOver : undefined,
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.remaining,
                    item.overBudget ? styles.over : undefined,
                  ]}>
                  {item.overBudget
                    ? `${formatCurrency(-item.remaining)} over budget`
                    : `${formatCurrency(item.remaining)} left`}
                </Text>
              </View>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setPicking(true)}
        testID="budget-add">
        <Text style={styles.addBtnText}>+ Set a budget</Text>
      </TouchableOpacity>

      <Modal visible={picking} transparent animationType="slide">
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {selectedCat ? `Limit for ${selectedCat.name}` : 'Pick a category'}
            </Text>
            {selectedCat ? (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder="Monthly limit (e.g. 400)"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={limitInput}
                  onChangeText={setLimitInput}
                  testID="budget-limit-input"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={saveLimit}
                  testID="budget-save">
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={categories}
                keyExtractor={c => String(c.categoryId)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.catRow}
                    onPress={() => setSelectedCat(item)}
                    testID={`budget-cat-${item.name}`}>
                    <Text style={styles.catRowText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  monthArrow: { fontSize: 28, color: colors.primary, paddingHorizontal: 12 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptyMsg: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  catName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  amounts: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  over: { color: colors.danger },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  fillOver: { backgroundColor: colors.danger },
  remaining: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  addBtn: {
    margin: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
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
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700' },
  catRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catRowText: { fontSize: 16, color: colors.textPrimary },
});
