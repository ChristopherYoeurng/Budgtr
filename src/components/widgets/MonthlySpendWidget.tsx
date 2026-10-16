import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { currentMonthKey } from '../../utils/format';
import { spendByMonth } from '../../db/repositories';
import { niceAxisMax, useMeasuredWidth } from './useMeasuredWidth';
import type { WidgetProps } from './registry';

export function MonthlySpendWidget({ db, version }: WidgetProps) {
  const { width, onLayout } = useMeasuredWidth();
  const thisMonth = currentMonthKey();

  const byMonth = useMemo(
    () => spendByMonth(db, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const maxVal = Math.max(0, ...byMonth.map(m => m.total));
  const { maxValue, stepValue } = niceAxisMax(maxVal, 4);

  const barData = byMonth.map(m => {
    const isCurrent = m.month === thisMonth;
    return {
      value: Math.round(m.total),
      label: m.month.slice(5),
      // Highlight the current month's bar.
      frontColor: isCurrent ? colors.primaryDark : colors.primary,
    };
  });

  // Fit bars + gaps to the measured width (reserve the y-axis gutter).
  const n = barData.length || 1;
  const plotW = Math.max(0, width - 44);
  const barWidth = plotW > 0 ? Math.max(14, Math.min(34, (plotW / n) * 0.55)) : 26;
  const spacing = plotW > 0 ? Math.max(8, (plotW - barWidth * n) / n) : 18;

  return (
    <WidgetCard
      title="Monthly spending"
      subtitle={`Last ${barData.length} months`}
      testID="insights-bar">
      <View style={styles.barWrap} onLayout={onLayout}>
        {barData.length > 0 && width > 0 ? (
          <BarChart
            data={barData}
            width={plotW}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={spacing / 2}
            endSpacing={spacing / 2}
            maxValue={maxValue}
            stepValue={stepValue}
            noOfSections={4}
            roundedTop
            yAxisThickness={0}
            xAxisThickness={0}
            frontColor={colors.primary}
            xAxisLabelTextStyle={styles.axis}
            yAxisTextStyle={styles.axis}
          />
        ) : barData.length === 0 ? (
          <Text style={styles.noData}>Not enough data yet.</Text>
        ) : null}
      </View>
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  barWrap: { marginTop: 8, width: '100%' },
  axis: { color: colors.textMuted, fontSize: 10 },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
});
