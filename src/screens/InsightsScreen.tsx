import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { currentMonthKey } from '../utils/format';
import { useAppData } from '../context/AppDataContext';
import { TransactionsRepo, WidgetPrefsRepo } from '../db/repositories';
import {
  WIDGET_BY_ID,
  resolveLayout,
} from '../components/widgets/registry';

type LayoutItem = { widgetId: string; visible: boolean };

export function InsightsScreen() {
  const { db, version, bumpVersion } = useAppData();
  const [month] = useState(currentMonthKey());
  const [editing, setEditing] = useState(false);

  const hasData = useMemo(
    () => TransactionsRepo.list(db, { limit: 1 }).length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const layout = useMemo<LayoutItem[]>(
    () => resolveLayout(WidgetPrefsRepo.all(db)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version],
  );

  const persist = (next: LayoutItem[]) => {
    WidgetPrefsRepo.saveAll(db, next);
    bumpVersion();
  };

  const toggleVisible = (id: string) =>
    persist(
      layout.map(l =>
        l.widgetId === id ? { ...l, visible: !l.visible } : l,
      ),
    );

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= layout.length) {
      return;
    }
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  if (!hasData) {
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

  const visibleWidgets = layout.filter(l => l.visible);

  return (
    <ScreenContainer title="Insights">
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={() => setEditing(e => !e)}
          style={[styles.editBtn, editing && styles.editBtnActive]}
          testID="insights-edit-toggle">
          <Text style={[styles.editText, editing && styles.editTextActive]}>
            {editing ? 'Done' : 'Customize'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {editing ? (
          // Edit mode: reorder + show/hide every registered widget.
          <View testID="insights-edit-list">
            <Text style={styles.editHint}>
              Toggle widgets on/off and reorder how they appear.
            </Text>
            {layout.map((item, index) => {
              const def = WIDGET_BY_ID[item.widgetId];
              if (!def) {
                return null;
              }
              return (
                <View
                  key={item.widgetId}
                  style={styles.editRow}
                  testID={`widget-config-${item.widgetId}`}>
                  <View style={styles.reorder}>
                    <TouchableOpacity
                      onPress={() => move(index, -1)}
                      disabled={index === 0}
                      testID={`widget-up-${item.widgetId}`}>
                      <Text
                        style={[
                          styles.arrow,
                          index === 0 && styles.arrowDisabled,
                        ]}>
                        ▲
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => move(index, 1)}
                      disabled={index === layout.length - 1}
                      testID={`widget-down-${item.widgetId}`}>
                      <Text
                        style={[
                          styles.arrow,
                          index === layout.length - 1 && styles.arrowDisabled,
                        ]}>
                        ▼
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.editRowTitle}>{def.title}</Text>
                  <TouchableOpacity
                    onPress={() => toggleVisible(item.widgetId)}
                    style={[
                      styles.toggle,
                      item.visible && styles.toggleOn,
                    ]}
                    testID={`widget-toggle-${item.widgetId}`}>
                    <View
                      style={[
                        styles.knob,
                        item.visible && styles.knobOn,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          // Display mode: render visible widgets in saved order.
          visibleWidgets.map(item => {
            const def = WIDGET_BY_ID[item.widgetId];
            if (!def) {
              return null;
            }
            const Widget = def.component;
            return (
              <Widget
                key={item.widgetId}
                db={db}
                version={version}
                month={month}
              />
            );
          })
        )}

        {!editing && visibleWidgets.length === 0 ? (
          <EmptyState
            testID="insights-all-hidden"
            title="All widgets hidden"
            message="Tap Customize to turn some insights back on."
            actionLabel="Customize"
            onAction={() => setEditing(true)}
          />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
  },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  editBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  editText: { fontWeight: '700', color: colors.textPrimary },
  editTextActive: { color: '#FFFFFF' },
  content: { padding: 16 },
  editHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reorder: { marginRight: 12, alignItems: 'center' },
  arrow: { fontSize: 16, color: colors.primary, paddingVertical: 1 },
  arrowDisabled: { color: colors.border },
  editRowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.primary },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  knobOn: { alignSelf: 'flex-end' },
});
