import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { WidgetCard } from './WidgetCard';
import { colors } from '../../theme/colors';
import { formatCurrency, monthLabel } from '../../utils/format';
import { useMonthComparison } from './useMonthComparison';
import { niceAxisMax, useMeasuredWidth } from './useMeasuredWidth';
import {
  CategoryChips,
  ComparisonHeader,
  ComparisonLegend,
  MonthPickerModal,
} from './comparisonParts';
import { cumulativeSpendByDay } from '../../db/repositories';
import type { WidgetProps } from './registry';

/**
 * Build a monotonic day-indexed series (1..maxDay) from sparse cumulative
 * points, carrying the last running total forward across gap days so the line
 * is continuous for the whole month.
 */
function fillDays(
  points: { day: number; cumulative: number }[],
  maxDay: number,
): number[] {
  const byDay = new Map(points.map(p => [p.day, p.cumulative]));
  const out: number[] = [];
  let last = 0;
  for (let d = 1; d <= maxDay; d++) {
    if (byDay.has(d)) {
      last = byDay.get(d)!;
    }
    out.push(last);
  }
  return out;
}

export function MonthComparisonLineWidget({ db, version, month }: WidgetProps) {
  const cmp = useMonthComparison(db, version, month);
  const [picking, setPicking] = useState(false);
  const { width, onLayout } = useMeasuredWidth();

  // Names of the categories currently shown (chips drive this via the hook).
  const selectedNames = cmp.visible.map(c => c.categoryName);

  const currentPts = useMemo(
    () => cumulativeSpendByDay(db, month, selectedNames),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month, selectedNames.join('|')],
  );
  const otherPts = useMemo(
    () => cumulativeSpendByDay(db, cmp.other, selectedNames),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, cmp.other, selectedNames.join('|')],
  );

  // If `month` is the current month, only chart through today — the line
  // should not extend into future days that haven't happened yet.
  const now = new Date();
  const isCurrentMonth = month === now.toISOString().slice(0, 7);
  const todayDay = now.getDate();

  const dataMaxDay = Math.max(
    1,
    ...currentPts.map(p => p.day),
    ...otherPts.map(p => p.day),
  );
  // X-axis spans up to today (current month) or the full data range otherwise.
  const maxDay = isCurrentMonth ? Math.max(todayDay, dataMaxDay) : dataMaxDay;

  // Current month line stops at today; comparison month fills its whole range.
  const curLen = isCurrentMonth ? Math.min(todayDay, maxDay) : maxDay;
  const curSeries = fillDays(currentPts, curLen);
  const othSeries = fillDays(otherPts, maxDay);

  const curEnd = curSeries[curSeries.length - 1] ?? 0;
  const othEnd = othSeries[othSeries.length - 1] ?? 0;

  const yMaxData = Math.max(curEnd, othEnd, ...curSeries, ...othSeries, 0);
  const { maxValue, stepValue } = niceAxisMax(yMaxData, 3);

  const labelEvery = Math.max(1, Math.ceil(maxDay / 6));
  const toChartData = (series: number[], lineMonth: string) =>
    series.map((v, i) => {
      const day = i + 1;
      const isLast = day === series.length;
      return {
        value: Math.round(v),
        label: day % labelEvery === 0 ? String(day) : '',
        __month: lineMonth,
        __day: day,
        // Dot on the final ("current") day of each line.
        ...(isLast
          ? {
              showDataPoint: true,
              dataPointColor:
                lineMonth === month ? colors.primary : colors.chart[1],
              dataPointRadius: 5,
            }
          : {}),
      };
    });

  const hasData = selectedNames.length > 0 && (curEnd > 0 || othEnd > 0);

  return (
    <WidgetCard
      title="Spending over time"
      subtitle="Cumulative spend for the selected categories"
      testID="insights-comparison-line">
      <ComparisonHeader
        month={month}
        other={cmp.other}
        onOpenPicker={() => setPicking(true)}
      />

      <View style={styles.totalsRow}>
        <View>
          <Text style={styles.totalLabel}>{monthLabel(month)}</Text>
          <Text style={[styles.totalVal, { color: colors.primary }]}>
            {formatCurrency(curEnd)}
          </Text>
        </View>
        <View>
          <Text style={styles.totalLabel}>{monthLabel(cmp.other)}</Text>
          <Text style={[styles.totalVal, { color: colors.chart[1] }]}>
            {formatCurrency(othEnd)}
          </Text>
        </View>
      </View>

      {hasData ? (
        <View style={styles.chartWrap} onLayout={onLayout}>
          {width > 0 ? (
          <LineChart
            data={toChartData(curSeries, month)}
            data2={toChartData(othSeries, cmp.other)}
            width={width - 44}
            maxValue={maxValue}
            stepValue={stepValue}
            curved
            color1={colors.primary}
            color2={colors.chart[1]}
            hideDataPoints
            thickness={2}
            yAxisThickness={0}
            xAxisThickness={0}
            noOfSections={3}
            xAxisLabelTextStyle={styles.axis}
            yAxisTextStyle={styles.axis}
            spacing={Math.max(4, (width - 44 - 16) / Math.max(1, maxDay - 1))}
            initialSpacing={8}
            endSpacing={8}
            formatYLabel={(v: string) => `$${Math.round(Number(v))}`}
            pointerConfig={{
              pointerStripColor: colors.border,
              pointerStripWidth: 1,
              pointerColor: colors.textPrimary,
              radius: 5,
              pointerLabelWidth: 140,
              pointerLabelHeight: 70,
              activatePointersOnLongPress: false,
              autoAdjustPointerLabelPosition: true,
              pointerLabelComponent: (items: Array<{ value: number }>) => {
                const cur = items?.[0]?.value ?? 0;
                const oth = items?.[1]?.value ?? 0;
                return (
                  <View style={styles.tooltip} testID="line-pointer-tooltip">
                    <Text style={[styles.tipRow, { color: colors.primary }]}>
                      {monthLabel(month)}: {formatCurrency(cur)}
                    </Text>
                    <Text style={[styles.tipRow, { color: colors.chart[1] }]}>
                      {monthLabel(cmp.other)}: {formatCurrency(oth)}
                    </Text>
                  </View>
                );
              },
            }}
          />
          ) : null}
          <ComparisonLegend month={month} other={cmp.other} />
          <Text style={styles.hint}>Touch and drag across the chart to inspect any day.</Text>
        </View>
      ) : (
        <Text style={styles.noData}>
          {selectedNames.length === 0
            ? 'Pick a category below to chart its spending over time.'
            : 'No spending for the selected categories.'}
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
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalVal: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  chartWrap: { marginTop: 4, alignItems: 'center' },
  axis: { color: colors.textMuted, fontSize: 10 },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
  tooltip: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tipRow: { fontSize: 12, fontWeight: '700' },
});
