import { useMemo, useState } from 'react';
import {
  availableMonths,
  spendComparison,
  spendTotalForMonth,
  type CategoryComparison,
} from '../../db/repositories';
import { shiftMonth } from '../../utils/format';
import type { Database } from '../../db/types';

export interface UseMonthComparison {
  other: string;
  setOther: (m: string) => void;
  months: string[]; // other months available for comparison
  /** Categories currently shown on the chart (not hidden), capped for display. */
  visible: CategoryComparison[];
  /** Categories the user has removed from the chart. */
  hidden: CategoryComparison[];
  hideCategory: (name: string) => void;
  showCategory: (name: string) => void;
  currentTotal: number;
  otherTotal: number;
  diff: number;
}

/**
 * Shared data + interaction state for month-comparison widgets (bar & line).
 * Owns: the comparison month, the per-category spend for both months, and the
 * set of categories the user has hidden from the chart.
 */
export function useMonthComparison(
  db: Database,
  version: number,
  month: string,
  maxCategories = 6,
): UseMonthComparison {
  const [other, setOther] = useState(() => shiftMonth(month, -1));
  const [hiddenNames, setHiddenNames] = useState<Set<string>>(new Set());

  const months = useMemo(
    () => availableMonths(db).filter(m => m !== month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month],
  );

  const all = useMemo(
    () => spendComparison(db, month, other).slice(0, maxCategories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month, other, maxCategories],
  );

  const visible = useMemo(
    () => all.filter(c => !hiddenNames.has(c.categoryName)),
    [all, hiddenNames],
  );
  const hidden = useMemo(
    () => all.filter(c => hiddenNames.has(c.categoryName)),
    [all, hiddenNames],
  );

  const currentTotal = useMemo(
    () => spendTotalForMonth(db, month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, month],
  );
  const otherTotal = useMemo(
    () => spendTotalForMonth(db, other),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, version, other],
  );

  const hideCategory = (name: string) =>
    setHiddenNames(prev => new Set(prev).add(name));
  const showCategory = (name: string) =>
    setHiddenNames(prev => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });

  return {
    other,
    setOther,
    months,
    visible,
    hidden,
    hideCategory,
    showCategory,
    currentTotal,
    otherTotal,
    diff: currentTotal - otherTotal,
  };
}
