import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Measure a container's width via onLayout so charts can fill their card.
 *
 * Usage:
 *   const { width, onLayout } = useMeasuredWidth();
 *   <View onLayout={onLayout}>{width > 0 && <Chart width={width} />}</View>
 */
export function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(prev => (Math.abs(prev - w) > 0.5 ? w : prev));
  }, []);
  return { width, onLayout };
}

/**
 * Pick a "nice" rounded value just above `maxDataValue` for a chart's top
 * gridline, so the tallest bar/point sits a little below the top. Returns a
 * value and the per-section step (maxValue / sections).
 */
export function niceAxisMax(maxDataValue: number, sections = 4): {
  maxValue: number;
  stepValue: number;
} {
  if (maxDataValue <= 0) {
    return { maxValue: sections, stepValue: 1 };
  }
  // ~8% headroom above the highest value, then round the per-section step up
  // to a clean number so the axis labels read nicely.
  const target = maxDataValue * 1.08;
  const rawStep = target / sections;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.ceil(rawStep / mag) * mag;
  return { maxValue: niceStep * sections, stepValue: niceStep };
}
