import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { formatCurrency } from '../../utils/format';
import { RecurringRepo } from '../../db/repositories';
import type { WidgetProps } from './registry';

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  SEMI_MONTHLY: 'Twice a month',
  MONTHLY: 'Monthly',
  ANNUALLY: 'Yearly',
  UNKNOWN: 'Recurring',
};

export function RecurringWidget({ db, version }: WidgetProps) {
  const recurring = useMemo(
    () => RecurringRepo.all(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  return (
    <WidgetCard
      title="Recurring & bills"
      subtitle="Detected subscriptions, bills, and income"
      testID="insights-recurring">
      {recurring.length > 0 ? (
        <View>
          {recurring.map(r => (
            <View key={r.streamId} style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.merchantName ?? r.description}
                </Text>
                <Text style={styles.meta}>
                  {FREQ_LABEL[r.frequency] ?? 'Recurring'}
                  {r.nextDate ? ` · next ${r.nextDate}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.amount,
                  r.direction === 'inflow' ? styles.in : undefined,
                ]}>
                {r.direction === 'inflow' ? '+' : '-'}
                {formatCurrency(r.averageAmount)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noData}>
          No recurring transactions detected yet. Link an account and refresh.
        </Text>
      )}
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  left: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  in: { color: colors.primary },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
});
