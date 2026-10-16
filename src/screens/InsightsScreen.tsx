import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import {
  currentMonthKey,
  formatCurrency,
  monthLabel,
} from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import { spendByCategory, spendByMonth } from '../db/repositories';
import type { CategorySpend, MonthSpend } from '../types/models';

export function InsightsScreen() {
  const { db, version } = useAppData();
  const [month] = useState(currentMonthKey());

  const byCategory = useMemo<CategorySpend[]>(
    () => spendByCategory(db, month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month],
  );
  const byMonth = useMemo<MonthSpend[]>(
    () => spendByMonth(db, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const totalSpend = byCategory.reduce((s, c) => s + c.total, 0);

  if (byCategory.length === 0 && byMonth.length === 0) {
    return (
      <ScreenContainer title="Insights">
        <EmptyState
          testID="insights-empty"
          title="No insights yet"
          message="Charts appear once you have transactions to analyze."
        />
      </ScreenContainer>
    );
  }

  const pieData = byCategory.slice(0, 8).map((c, i) => ({
    value: c.total,
    color: colors.chart[i % colors.chart.length],
    text: c.categoryName,
  }));

  const barData = byMonth.map(m => ({
    value: Math.round(m.total),
    label: m.month.slice(5), // MM
    frontColor: colors.primary,
  }));

  return (
    <ScreenContainer title="Insights">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spending by category</Text>
          <Text style={styles.subtitle}>{monthLabel(month)}</Text>
          {pieData.length > 0 ? (
            <View style={styles.pieWrap} testID="insights-pie">
              <PieChart
                data={pieData}
                donut
                radius={110}
                innerRadius={66}
                centerLabelComponent={() => (
                  <View style={styles.pieCenter}>
                    <Text style={styles.pieCenterLabel}>Total</Text>
                    <Text style={styles.pieCenterValue}>
                      {formatCurrency(totalSpend)}
                    </Text>
                  </View>
                )}
              />
              <View style={styles.legend}>
                {pieData.map((d, i) => (
                  <View key={i} style={styles.legendRow}>
                    <View
                      style={[styles.legendDot, { backgroundColor: d.color }]}
                    />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {d.text}
                    </Text>
                    <Text style={styles.legendValue}>
                      {formatCurrency(d.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.noData}>No spending this month.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly spending</Text>
          <Text style={styles.subtitle}>Last {barData.length} months</Text>
          {barData.length > 0 ? (
            <View testID="insights-bar" style={styles.barWrap}>
              <BarChart
                data={barData}
                barWidth={26}
                spacing={18}
                roundedTop
                yAxisThickness={0}
                xAxisThickness={0}
                noOfSections={4}
                frontColor={colors.primary}
              />
            </View>
          ) : (
            <Text style={styles.noData}>Not enough data yet.</Text>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
  pieWrap: { alignItems: 'center' },
  pieCenter: { alignItems: 'center' },
  pieCenterLabel: { fontSize: 12, color: colors.textMuted },
  pieCenterValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  legend: { width: '100%', marginTop: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { flex: 1, fontSize: 14, color: colors.textPrimary },
  legendValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  barWrap: { marginTop: 8, alignItems: 'center' },
  noData: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
});
