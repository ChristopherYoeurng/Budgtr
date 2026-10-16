import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors } from '../theme/colors';
import {
  formatCurrency,
  monthLabel,
  rangeStartDate,
  shortDate,
  type DateRangeKey,
} from '../utils/format';
import { NetWorthRepo } from '../db/repositories';
import type { Database } from '../db/types';

const RANGES: DateRangeKey[] = ['1W', '1M', '3M', '1Y', 'ALL'];

// Approximate non-usable chrome: top safe area + header + tab bar + home bar.
const CHROME_HEIGHT = 210;
// Width the y-axis labels + their gutter occupy inside the plot container.
const Y_AXIS_GUTTER = 44;

/** Compact, signed currency for y-axis labels: 1500 -> "$1.5k", -1357 -> "-$1.4k", 450 -> "$450". */
function compactCurrency(raw: string): string {
  const n = Number(raw);
  if (!isFinite(n)) {
    return '';
  }
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

/** Nice human date for the pointer tooltip, e.g. "Jan 5, 2026". */
function longDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  db: Database;
  version: number;
}

export function NetWorthChart({ db, version }: Props) {
  const [range, setRange] = useState<DateRangeKey>('1M');
  const { height: windowHeight } = useWindowDimensions();
  // Measured width of the plot container (fills the card). Starts at 0 and is
  // set on first layout, so the chart always matches the real card width.
  const [plotWidth, setPlotWidth] = useState(0);

  const usableHeight = Math.max(windowHeight - CHROME_HEIGHT, 320);

  const points = useMemo(() => {
    const since = rangeStartDate(range);
    return NetWorthRepo.since(db, since);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, range]);

  const delta = useMemo(() => {
    if (points.length < 2) {
      return null;
    }
    return points[points.length - 1].netWorth - points[0].netWorth;
  }, [points]);

  const cardHeight = Math.round(usableHeight * 0.4);
  const plotHeight = Math.max(110, cardHeight - 120);

  // Tight y-axis bounds: small top padding so the line sits just below the top,
  // and a little bottom headroom. (gifted-charts needs non-negative values, so
  // we offset everything up by -yMin and translate labels back.)
  const { yMin, yAxisMax, offset } = useMemo(() => {
    if (points.length === 0) {
      return { yMin: 0, yAxisMax: 100, offset: 0 };
    }
    const vals = points.map(p => p.netWorth);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = Math.max(hi - lo, 1);
    const topPad = span * 0.08; // just above the highest value
    const botPad = span * 0.08;
    const min = Math.floor(lo - botPad);
    const max = Math.ceil(hi + topPad);
    return { yMin: min, yAxisMax: max - min, offset: -min };
  }, [points]);

  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const todayStr = new Date().toISOString().slice(0, 10);

  const chartData = useMemo(
    () =>
      points.map((p, i) => ({
        value: Math.round(p.netWorth) + offset,
        label: i % labelEvery === 0 ? shortDate(p.date) : '',
        // Dot on the most recent ("current") snapshot.
        ...(p.date === todayStr || i === points.length - 1
          ? {
              showDataPoint: true,
              dataPointColor: colors.primary,
              dataPointRadius: 5,
            }
          : {}),
        // carried for the tooltip
        date: p.date,
        realValue: Math.round(p.netWorth),
      })),
    [points, offset, labelEvery, todayStr],
  );

  // Chart drawable width + fixed edge spacings. Spacing is sized so that
  //   initialSpacing + (n-1)*spacing + endSpacing <= chartWidth
  // (floored) — this guarantees the last point never clips off the right edge,
  // which previously happened on dense ranges (3M/1Y/ALL).
  const CHART_INIT = 8;
  const CHART_END = 8;
  const chartWidth = Math.max(0, plotWidth - Y_AXIS_GUTTER);
  const chartSpacing = useMemo(() => {
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
    <View
      style={[styles.container, { height: cardHeight }]}
      testID="networth-chart">
      <View style={styles.ranges}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => setRange(r)}
            style={[styles.rangeBtn, r === range && styles.rangeBtnActive]}
            testID={`networth-range-${r}`}>
            <Text
              style={[styles.rangeText, r === range && styles.rangeTextActive]}>
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {chartData.length < 2 ? (
        <View style={styles.insufficient} testID="networth-insufficient">
          <Text style={styles.insufficientText}>
            Not enough history yet. Your net worth is tracked each time you
            refresh — check back after a few days.
          </Text>
        </View>
      ) : (
        <>
          {delta != null ? (
            <Text
              style={[
                styles.delta,
                delta >= 0 ? styles.deltaUp : styles.deltaDown,
              ]}>
              {delta >= 0 ? '▲ ' : '▼ '}
              {formatCurrency(Math.abs(delta))} over {range}
            </Text>
          ) : null}

          <View style={styles.plot} onLayout={onPlotLayout}>
            {plotWidth > 0 ? (
              <LineChart
                data={chartData}
                width={chartWidth}
                height={plotHeight}
                maxValue={yAxisMax}
                areaChart
                curved
                color={colors.primary}
                startFillColor={colors.primary}
                startOpacity={0.25}
                endOpacity={0.02}
                thickness={2}
                hideDataPoints={chartData.length > 12}
                dataPointsColor={colors.primary}
                yAxisThickness={0}
                xAxisThickness={0}
                noOfSections={4}
                yAxisTextStyle={styles.axis}
                xAxisLabelTextStyle={styles.axis}
                rotateLabel
                spacing={chartSpacing}
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
                      <View style={styles.tooltip} testID="networth-pointer">
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  plot: { flex: 1, width: '100%' },
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
  delta: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  deltaUp: { color: colors.success },
  deltaDown: { color: colors.danger },
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
});
