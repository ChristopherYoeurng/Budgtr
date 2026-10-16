/**
 * Central color palette for the Budget app.
 * Mint-inspired green primary with neutral surfaces.
 */
export const colors = {
  primary: '#1AAE6F',
  primaryDark: '#128A57',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  border: '#E3E6EA',
  textPrimary: '#1A1D1F',
  textSecondary: '#6B7177',
  textMuted: '#9AA0A6',
  danger: '#E5484D',
  warning: '#F5A623',
  success: '#1AAE6F',
  // Category chart palette (stable ordering for charts/legends).
  chart: [
    '#1AAE6F',
    '#4C8DFF',
    '#F5A623',
    '#E5484D',
    '#9B59B6',
    '#00B8D9',
    '#FF7A59',
    '#7F8C8D',
  ],
} as const;

export type AppColors = typeof colors;
