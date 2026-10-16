import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { formatCurrency, monthLabel } from '../../utils/format';
import { spendByCategory } from '../../db/repositories';
import type { WidgetProps } from './registry';

export function SpendByCategoryWidget({ db, version, month }: WidgetProps) {
  const data = useMemo(
    () => spendByCategory(db, month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month],
  );
  const total = data.reduce((s, c) => s + c.total, 0);
  const pieData = data.slice(0, 8).map((c, i) => ({
    value: c.total,
    color: colors.chart[i % colors.chart.length],
    text: c.categoryName,
  }));

  return (
    <WidgetCard
      title="Spending by category"
      subtitle={monthLabel(month)}
      testID="insights-pie">
      {pieData.length > 0 ? (
        <View style={styles.pieWrap}>
          <PieChart
            data={pieData}
            donut
            radius={110}
            innerRadius={66}
            centerLabelComponent={() => (
              <View style={styles.pieCenter}>
                <Text style={styles.pieCenterLabel}>Total</Text>
                <Text style={styles.pieCenterValue}>
                  {formatCurrency(total)}
                </Text>
              </View>
            )}
          />
          <View style={styles.legend}>
            {pieData.map((d, i) => (
              <View key={i} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                <Text style={styles.legendText} numberOfLines={1}>
                  {d.text}
                </Text>
                <Text style={styles.legendValue}>{formatCurrency(d.value)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.noData}>No spending this month.</Text>
      )}
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  pieWrap: { alignItems: 'center' },
  pieCenter: { alignItems: 'center' },
  pieCenterLabel: { fontSize: 12, color: colors.textMuted },
  pieCenterValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  legend: { width: '100%', marginTop: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { flex: 1, fontSize: 14, color: colors.textPrimary },
  legendValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
});
