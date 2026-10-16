import type React from 'react';
import type { Database } from '../../db/types';
import { SpendByCategoryWidget } from './SpendByCategoryWidget';
import { MonthlySpendWidget } from './MonthlySpendWidget';
import { MonthComparisonWidget } from './MonthComparisonWidget';
import { MonthComparisonLineWidget } from './MonthComparisonLineWidget';
import { RecurringWidget } from './RecurringWidget';

/** Props every Insights widget receives. `month` is the selected focus month. */
export interface WidgetProps {
  db: Database;
  version: number;
  month: string;
}

export interface WidgetDef {
  id: string;
  title: string;
  component: React.ComponentType<WidgetProps>;
}

/**
 * Registry of all available Insights widgets. The array order here is the
 * default layout; user preferences (order + visibility) override it and are
 * persisted via WidgetPrefsRepo.
 */
export const WIDGETS: WidgetDef[] = [
  {
    id: 'spend-by-category',
    title: 'Spending by category',
    component: SpendByCategoryWidget,
  },
  {
    id: 'month-comparison',
    title: 'Month comparison (bars)',
    component: MonthComparisonWidget,
  },
  {
    id: 'month-comparison-line',
    title: 'Spending over time',
    component: MonthComparisonLineWidget,
  },
  {
    id: 'monthly-spend',
    title: 'Monthly spending',
    component: MonthlySpendWidget,
  },
  {
    id: 'recurring',
    title: 'Recurring & bills',
    component: RecurringWidget,
  },
];

export const WIDGET_BY_ID: Record<string, WidgetDef> = Object.fromEntries(
  WIDGETS.map(w => [w.id, w]),
);

/** Default ordered, all-visible layout. */
export function defaultLayout(): Array<{ widgetId: string; visible: boolean }> {
  return WIDGETS.map(w => ({ widgetId: w.id, visible: true }));
}

/**
 * Merge persisted prefs with the registry: keeps saved order/visibility, drops
 * unknown ids, and appends any newly-added widgets (visible) at the end.
 */
export function resolveLayout(
  prefs: Array<{ widgetId: string; visible: boolean }>,
): Array<{ widgetId: string; visible: boolean }> {
  if (prefs.length === 0) {
    return defaultLayout();
  }
  const known = prefs.filter(p => WIDGET_BY_ID[p.widgetId]);
  const seen = new Set(known.map(p => p.widgetId));
  const appended = WIDGETS.filter(w => !seen.has(w.id)).map(w => ({
    widgetId: w.id,
    visible: true,
  }));
  return [...known, ...appended];
}
