import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors } from '../theme/colors';
import {
  formatCurrency,
  rangeStartDate,
  shortDate,
  type DateRangeKey,
} from '../utils/format';
import type { NetWorthPoint } from '../types/models';

const RANGES: DateRangeKey[] = ['1W', '1M', '3M', '1Y', 'ALL'];
const Y_AXIS_GUTTER = 44;
const CHART_INIT = 8;
const CHART_END = 8;

function compactCurrency(raw: string): string {
  const n = Number(raw);
  if (!isFinite(n)) {
    return '';
  }
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${Math.round(abs)}`;
}

function longDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  /** Series oldest-first. (Reuses NetWorthPoint {date, netWorth}.) */
  points: NetWorthPoint[];
  height?: number;
  /** When set, highlight the point on/at-or-before this date (YYYY-MM-DD). */
  highlightDate?: string | null;
  testID?: string;
  insufficientMessage?: string;
}

/**
 * Reusable balance-over-time area chart with range pills (1W…ALL), a tuned
 * y-axis, a drag pointer tooltip, a current-day dot, and width fitted to its
 * container so the last point never clips. `highlightDate` lets a parent
 * (e.g. tapping a transaction) pin a labeled dot at a specific date.
 */
export function BalanceChart({
  points: allPoints,
  height = 180,
  highlightDate,
  testID = 'balance-chart',
  insufficientMessage = 'Not enough history yet.',
}: Props) {
  const [range, setRange] = useState<DateRangeKey>('1M');
  const [plotWidth, setPlotWidth] = useState(0);

  const points = useMemo(() => {
    const since = rangeStartDate(range);
    return allPoints.filter(p => p.date >= since);
  }, [allPoints, range]);

  const { yAxisMax, offset } = useMemo(() => {
    if (points.length === 0) {
      return { yAxisMax: 100, offset: 0 };
    }
    const vals = points.map(p => p.netWorth);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = Math.max(hi - lo, 1);
    const min = Math.floor(lo - span * 0.08);
    const max = Math.ceil(hi + span * 0.08);
    return { yAxisMax: max - min, offset: -min };
  }, [points]);

  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const todayStr = new Date().toISOString().slice(0, 10);

  // Resolve the highlight to the index of the last point on/before that date.
  const highlightIndex = useMemo(() => {
    if (!highlightDate || points.length === 0) {
      return -1;
    }
    let idx = -1;
    for (let i = 0; i < points.length; i++) {
      if (points[i].date <= highlightDate) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [highlightDate, points]);

  const chartData = useMemo(
    () =>
      points.map((p, i) => {
        const isLast = i === points.length - 1 || p.date === todayStr;
        const isHighlight = i === highlightIndex;
        return {
          value: Math.round(p.netWorth) + offset,
          label: i % labelEvery === 0 ? shortDate(p.date) : '',
          date: p.date,
          realValue: Math.round(p.netWorth),
          ...(isHighlight
            ? {
                showDataPoint: true,
                dataPointColor: colors.warning,
                dataPointRadius: 6,
                dataPointLabelComponent: () => (
                  <View style={styles.pin} testID={`${testID}-highlight`}>
                    <Text style={styles.pinText}>
                      {formatCurrency(p.netWorth)}
                    </Text>
                  </View>
                ),
                dataPointLabelShiftY: -24,
              }
            : isLast
            ? {
                showDataPoint: true,
                dataPointColor: colors.primary,
                dataPointRadius: 5,
              }
            : {}),
        };
      }),
    [points, offset, labelEvery, todayStr, highlightIndex, testID],
  );

  const chartWidth = Math.max(0, plotWidth - Y_AXIS_GUTTER);
  const spacing = useMemo(() => {
    const n = chartData.length;
    if (n < 2 || chartWidth === 0) {
      return 40;
    }
    const usable = chartWidth - CHART_INIT - CHART_END;
    return Math.max(1, Math.floor((usable / (n - 1)) * 100) / 100);
  }, [chartData.length, chartWidth]);

  const onPlotLayout = (e: LayoutChangeEvent) =>
    setPlotWidth(e.nativeEvent.layout.width);

  return (
    <View testID={testID}>
      <View style={styles.ranges}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => setRange(r)}
            style={[styles.rangeBtn, r === range && styles.rangeBtnActive]}
            testID={`${testID}-range-${r}`}>
            <Text style={[styles.rangeText, r === range && styles.rangeTextActive]}>
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {chartData.length < 2 ? (
        <View style={styles.insufficient} testID={`${testID}-insufficient`}>
          <Text style={styles.insufficientText}>{insufficientMessage}</Text>
        </View>
      ) : (
        <View style={[styles.plot, { height }]} onLayout={onPlotLayout}>
          {plotWidth > 0 ? (
            <LineChart
              data={chartData}
              width={chartWidth}
              height={height}
              maxValue={yAxisMax}
              areaChart
              curved
              color={colors.primary}
              startFillColor={colors.primary}
              startOpacity={0.25}
              endOpacity={0.02}
              thickness={2}
              hideDataPoints={chartData.length > 12}
              yAxisThickness={0}
              xAxisThickness={0}
              noOfSections={4}
              yAxisTextStyle={styles.axis}
              xAxisLabelTextStyle={styles.axis}
              rotateLabel
              spacing={spacing}
              initialSpacing={CHART_INIT}
              endSpacing={CHART_END}
              formatYLabel={(v: string) =>
                compactCurrency(String(Number(v) - offset))
              }
              pointerConfig={{
                pointerStripColor: colors.border,
                pointerStripWidth: 1,
                pointerColor: colors.primary,
                radius: 5,
                pointerLabelWidth: 150,
                pointerLabelHeight: 56,
                activatePointersOnLongPress: false,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (
                  items: Array<{ date?: string; realValue?: number }>,
                ) => {
                  const it = items?.[0];
                  if (!it) {
                    return null;
                  }
                  return (
                    <View style={styles.tooltip} testID={`${testID}-pointer`}>
                      <Text style={styles.tipDate}>
                        {it.date ? longDate(it.date) : ''}
                      </Text>
                      <Text style={styles.tipVal}>
                        {formatCurrency(it.realValue ?? 0)}
                      </Text>
                    </View>
                  );
                },
              }}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { width: '100%' },
  ranges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rangeBtn: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  rangeBtnActive: { backgroundColor: colors.primary },
  rangeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  rangeTextActive: { color: '#FFFFFF' },
  axis: { color: colors.textMuted, fontSize: 10 },
  insufficient: { paddingVertical: 24, alignItems: 'center' },
  insufficientText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tipDate: { fontSize: 11, color: colors.textMuted },
  tipVal: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  pin: {
    backgroundColor: colors.warning,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pinText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
