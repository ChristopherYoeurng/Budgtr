import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { formatCurrency, monthLabel } from '../../utils/format';
import { spendByCategory } from '../../db/repositories';
import type { WidgetProps } from './registry';

export function SpendByCategoryWidget({ db, version, month }: WidgetProps) {
  const [selected, setSelected] = useState<number | null>(null);

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
    focused: selected === i,
    onPress: () => setSelected(prev => (prev === i ? null : i)),
  }));

  // Center label: selected slice's value, or the total when nothing is tapped.
  const sel = selected != null ? pieData[selected] : null;

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
            focusOnPress
            sectionAutoFocus
            centerLabelComponent={() => (
              <View style={styles.pieCenter} testID="pie-center">
                <Text style={styles.pieCenterLabel} numberOfLines={1}>
                  {sel ? sel.text : 'Total'}
                </Text>
                <Text style={styles.pieCenterValue}>
                  {formatCurrency(sel ? sel.value : total)}
                </Text>
                {sel ? (
                  <Text style={styles.pieCenterPct}>
                    {total > 0 ? Math.round((sel.value / total) * 100) : 0}%
                  </Text>
                ) : null}
              </View>
            )}
          />
          <View style={styles.legend}>
            {pieData.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.legendRowFull,
                  selected === i && styles.legendRowSel,
                ]}
                onPress={d.onPress}
                testID={`pie-legend-${d.text}`}>
                <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                <Text style={styles.legendTextFull} numberOfLines={1}>
                  {d.text}
                </Text>
                <Text style={styles.legendValue}>{formatCurrency(d.value)}</Text>
              </TouchableOpacity>
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
  pieCenterLabel: { fontSize: 12, color: colors.textMuted, maxWidth: 100 },
  pieCenterValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  pieCenterPct: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  legend: { width: '100%', marginTop: 6 },
  legendRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  legendRowSel: { backgroundColor: colors.background },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendTextFull: { flex: 1, fontSize: 14, color: colors.textPrimary },
  legendValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
});
