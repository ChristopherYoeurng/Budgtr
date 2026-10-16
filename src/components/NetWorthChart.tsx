import React, { useMemo, useState } from 'react';
import {
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
  rangeStartDate,
  shortDate,
  type DateRangeKey,
} from '../utils/format';
import { NetWorthRepo } from '../db/repositories';
import type { Database } from '../db/types';

const RANGES: DateRangeKey[] = ['1W', '1M', '3M', '1Y', 'ALL'];

// Approximate non-usable chrome: top safe area + header + tab bar + home bar.
const CHROME_HEIGHT = 210;

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

interface Props {
  db: Database;
  version: number;
}

/**
 * Net-worth-over-time line chart with selectable date ranges. Reads daily
 * snapshots recorded on each sync. History only accrues from when snapshots
 * began (Plaid does not backfill historical balances).
 */
export function NetWorthChart({ db, version }: Props) {
  const [range, setRange] = useState<DateRangeKey>('1M');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Target ~40% of usable vertical space for the WHOLE card. Subtract the
  // in-card chrome (range pills + delta label + x-axis labels ≈ 96pt) so the
  // plot area height leaves the total card at ~40%.
  const usableHeight = Math.max(windowHeight - CHROME_HEIGHT, 320);

  const points = useMemo(() => {
    const since = rangeStartDate(range);
    return NetWorthRepo.since(db, since);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, range]);

  const chartData = useMemo(() => {
    // Only label ~5 evenly spaced points to avoid x-axis clutter.
    const n = points.length;
    const labelEvery = Math.max(1, Math.ceil(n / 5));
    return points.map((p, i) => ({
      value: Math.round(p.netWorth),
      label: i % labelEvery === 0 ? shortDate(p.date) : '',
    }));
  }, [points]);

  // Fit all points across the card width (card ≈ window width - 32 margin - 28 padding).
  const plotWidth = windowWidth - 32 - 28 - 40; // minus y-axis label gutter
  const chartSpacing = useMemo(() => {
    const n = chartData.length;
    if (n < 2) {
      return 40;
    }
    return Math.max(6, Math.min(60, plotWidth / (n - 1)));
  }, [chartData.length, plotWidth]);

  const delta = useMemo(() => {
    if (points.length < 2) {
      return null;
    }
    return points[points.length - 1].netWorth - points[0].netWorth;
  }, [points]);

  // Fixed card height = ~40% of usable space; the plot gets what's left after
  // the pills + delta + x-axis labels. overflow:hidden guarantees no spillover.
  const cardHeight = Math.round(usableHeight * 0.4);

  // Tight y-axis bounds from the data (with a little padding), so the line
  // uses the full plot height instead of being squashed by auto-ranging.
  const { yMax, yMin } = useMemo(() => {
    if (points.length === 0) {
      return { yMax: 100, yMin: 0 };
    }
    const vals = points.map(p => p.netWorth);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.1, 50);
    return { yMax: Math.ceil(hi + pad), yMin: Math.floor(lo - pad) };
  }, [points]);

  // gifted-charts can't render below zero cleanly, so offset all values up by
  // -yMin to keep them positive, then subtract the offset back in the y-labels.
  const offset = -yMin;
  const offsetData = useMemo(
    () => chartData.map(d => ({ ...d, value: d.value + offset })),
    [chartData, offset],
  );
  const yAxisMax = yMax + offset; // == yMax - yMin
  const plotHeight = Math.max(110, cardHeight - 120);

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
              style={[
                styles.rangeText,
                r === range && styles.rangeTextActive,
              ]}>
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
          <LineChart
            data={offsetData}
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
            initialSpacing={10}
            endSpacing={10}
            adjustToWidth
            formatYLabel={(v: string) => compactCurrency(String(Number(v) - offset))}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ranges: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
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
});
