import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { formatCurrency, monthLabel } from '../../utils/format';
import { useMonthComparison } from './useMonthComparison';
import { niceAxisMax, useMeasuredWidth } from './useMeasuredWidth';
import {
  CategoryChips,
  ComparisonHeader,
  ComparisonLegend,
  ComparisonTotals,
  MonthPickerModal,
} from './comparisonParts';
import type { WidgetProps } from './registry';

export function MonthComparisonWidget({ db, version, month }: WidgetProps) {
  const cmp = useMonthComparison(db, version, month);
  const [picking, setPicking] = useState(false);
  const { width, onLayout } = useMeasuredWidth();

  // Two bars per visible category (current = primary, other = chart[1]).
  // Each bar carries the metadata the floating tooltip needs.
  const barData = cmp.visible.flatMap((c, idx) => [
    {
      value: Math.round(c.current),
      frontColor: colors.primary,
      spacing: 2,
      label:
        c.categoryName.length > 6
          ? c.categoryName.slice(0, 6) + '…'
          : c.categoryName,
      labelWidth: 48,
      // metadata for the tooltip
      categoryName: c.categoryName,
      tipMonth: month,
    },
    {
      value: Math.round(c.other),
      frontColor: colors.chart[1],
      spacing: idx === cmp.visible.length - 1 ? 0 : 18,
      categoryName: c.categoryName,
      tipMonth: cmp.other,
    },
  ]);

  const maxVal = Math.max(
    0,
    ...cmp.visible.map(c => Math.max(c.current, c.other)),
  );
  const { maxValue, stepValue } = niceAxisMax(maxVal, 3);

  return (
    <WidgetCard title="Month comparison (bars)" testID="insights-comparison">
      <ComparisonHeader
        month={month}
        other={cmp.other}
        onOpenPicker={() => setPicking(true)}
      />
      <ComparisonTotals
        currentTotal={cmp.currentTotal}
        diff={cmp.diff}
        other={cmp.other}
      />

      {barData.length > 0 ? (
        <View style={styles.chartWrap} onLayout={onLayout}>
          {width > 0 ? (
            <BarChart
              data={barData}
              width={width - 44}
              barWidth={14}
              maxValue={maxValue}
              stepValue={stepValue}
              roundedTop
              yAxisThickness={0}
              xAxisThickness={0}
              noOfSections={3}
              xAxisLabelTextStyle={styles.axis}
              yAxisTextStyle={styles.axis}
              // Floating tooltip hovering above the tapped bar.
              focusBarOnPress
              focusedBarConfig={{ color: colors.primaryDark }}
              renderTooltip={(item: {
                value: number;
                categoryName?: string;
                tipMonth?: string;
              }) => (
                <View style={styles.tooltip} testID="bar-tooltip">
                  <Text style={styles.tipCat}>{item.categoryName}</Text>
                  <Text style={styles.tipVal}>
                    {item.tipMonth ? `${monthLabel(item.tipMonth)}: ` : ''}
                    {formatCurrency(item.value)}
                  </Text>
                </View>
              )}
            />
          ) : null}
          <ComparisonLegend month={month} other={cmp.other} />
        </View>
      ) : (
        <Text style={styles.noData}>
          {cmp.hidden.length > 0
            ? 'All categories hidden — add some back below.'
            : 'Not enough data to compare.'}
        </Text>
      )}

      <CategoryChips
        visible={cmp.visible}
        hidden={cmp.hidden}
        onHide={cmp.hideCategory}
        onShow={cmp.showCategory}
      />

      <MonthPickerModal
        visible={picking}
        months={cmp.months}
        selected={cmp.other}
        onPick={m => {
          cmp.setOther(m);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  chartWrap: { marginTop: 4, alignItems: 'center' },
  axis: { color: colors.textMuted, fontSize: 10 },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
  tooltip: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 6,
    // lift it above the bar
    minWidth: 110,
  },
  tipCat: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  tipVal: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
