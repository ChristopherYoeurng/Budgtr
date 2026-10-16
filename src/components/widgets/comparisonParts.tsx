import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { formatCurrency, monthLabel } from '../../utils/format';
import type { CategoryComparison } from '../../db/repositories';

/** Header: "<currentMonth> vs [otherMonth ▾]" with a tappable dropdown. */
export function ComparisonHeader({
  month,
  other,
  onOpenPicker,
}: {
  month: string;
  other: string;
  onOpenPicker: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.compareLabel}>{monthLabel(month)}</Text>
      <Text style={styles.vs}>vs</Text>
      <TouchableOpacity
        onPress={onOpenPicker}
        style={styles.dropdown}
        testID="comparison-month-dropdown">
        <Text style={styles.dropdownText}>{monthLabel(other)}</Text>
        <Text style={styles.caret}> ▾</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Current-month total + signed delta vs the comparison month. */
export function ComparisonTotals({
  currentTotal,
  diff,
  other,
}: {
  currentTotal: number;
  diff: number;
  other: string;
}) {
  return (
    <View style={styles.totals}>
      <Text style={styles.totalCurrent}>{formatCurrency(currentTotal)}</Text>
      <Text
        style={[
          styles.diff,
          diff > 0 ? styles.diffUp : diff < 0 ? styles.diffDown : undefined,
        ]}>
        {diff === 0
          ? 'Same as'
          : `${diff > 0 ? '▲' : '▼'} ${formatCurrency(Math.abs(diff))} vs`}{' '}
        {monthLabel(other)}
      </Text>
    </View>
  );
}

/** Legend showing which color is which month. */
export function ComparisonLegend({
  month,
  other,
}: {
  month: string;
  other: string;
}) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text style={styles.legendText}>{monthLabel(month)}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: colors.chart[1] }]} />
        <Text style={styles.legendText}>{monthLabel(other)}</Text>
      </View>
    </View>
  );
}

/** Tooltip-style readout of the currently selected bar/point. */
export function SelectionReadout({
  selection,
}: {
  selection: { categoryName: string; month: string; value: number } | null;
}) {
  if (!selection) {
    return (
      <Text style={styles.hint} testID="comparison-selection-hint">
        Tap a bar or point to see its value.
      </Text>
    );
  }
  return (
    <View style={styles.readout} testID="comparison-selection">
      <Text style={styles.readoutCat}>{selection.categoryName}</Text>
      <Text style={styles.readoutVal}>
        {monthLabel(selection.month)}: {formatCurrency(selection.value)}
      </Text>
    </View>
  );
}

/**
 * Chips for removing visible categories and re-adding hidden ones. Visible
 * chips show an ✕; hidden chips sit under a divider and re-add on tap.
 */
export function CategoryChips({
  visible,
  hidden,
  onHide,
  onShow,
}: {
  visible: CategoryComparison[];
  hidden: CategoryComparison[];
  onHide: (name: string) => void;
  onShow: (name: string) => void;
}) {
  return (
    <View style={styles.chipsWrap}>
      <View style={styles.chipRow}>
        {visible.map(c => (
          <TouchableOpacity
            key={c.categoryName}
            style={styles.chip}
            onPress={() => onHide(c.categoryName)}
            testID={`comparison-hide-${c.categoryName}`}>
            <Text style={styles.chipText}>{c.categoryName}</Text>
            <Text style={styles.chipX}> ✕</Text>
          </TouchableOpacity>
        ))}
      </View>

      {hidden.length > 0 ? (
        <>
          <Text style={styles.availLabel}>Tap to add back</Text>
          <View style={styles.chipRow}>
            {hidden.map(c => (
              <TouchableOpacity
                key={c.categoryName}
                style={[styles.chip, styles.chipHidden]}
                onPress={() => onShow(c.categoryName)}
                testID={`comparison-show-${c.categoryName}`}>
                <Text style={styles.chipText}>{c.categoryName}</Text>
                <Text style={styles.chipPlus}> +</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Bottom-sheet month picker. */
export function MonthPickerModal({
  visible,
  months,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  months: string[];
  selected: string;
  onPick: (m: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>Compare against</Text>
          <ScrollView>
            {months.length === 0 ? (
              <Text style={styles.noData}>No other months with data yet.</Text>
            ) : (
              months.map(m => (
                <TouchableOpacity
                  key={m}
                  style={styles.monthRow}
                  onPress={() => onPick(m)}
                  testID={`comparison-month-${m}`}>
                  <Text style={styles.monthRowText}>{monthLabel(m)}</Text>
                  {m === selected ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  compareLabel: { fontSize: 14, fontWeight: '700', color: colors.primary },
  vs: { fontSize: 13, color: colors.textMuted, marginHorizontal: 8 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dropdownText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  caret: { fontSize: 12, color: colors.textSecondary },
  totals: { marginBottom: 12 },
  totalCurrent: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  diff: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  diffUp: { color: colors.danger },
  diffDown: { color: colors.success },
  legend: { flexDirection: 'row', marginTop: 12, gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, color: colors.textSecondary },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 10,
    fontStyle: 'italic',
  },
  readout: {
    marginTop: 10,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
  },
  readoutCat: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  readoutVal: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  chipsWrap: { marginTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  chipHidden: { backgroundColor: colors.textMuted },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  chipX: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  chipPlus: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  availLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 12,
    marginBottom: 6,
  },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
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
    maxHeight: '60%',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  monthRowText: { fontSize: 16, color: colors.textPrimary },
  check: { fontSize: 16, color: colors.primary, fontWeight: '700' },
});
