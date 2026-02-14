export const colors = {
  // Backgrounds
  background: '#FAF9F7',
  backgroundCream: '#F5F3EF',
  cardBackground: '#FFFFFF',

  // Primary - Deep Purple
  primary: '#5B21B6',
  primaryLight: '#7C3AED',
  primaryDark: '#4C1D95',
  primaryMuted: '#DDD6FE',

  // Accent - Warm Gold
  accent: '#D97706',
  accentLight: '#F59E0B',
  accentMuted: '#FDE68A',

  // Text
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Status
  success: '#059669',
  successLight: '#D1FAE5',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  error: '#DC2626',
  errorLight: '#FEE2E2',

  // Borders & Dividers
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Shadows (for elevation)
  shadow: '#000000',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',

  // Cash Advance specific
  advanceLocked: '#9CA3AF',
  advanceActive: '#5B21B6',
} as const;

export type ColorKey = keyof typeof colors;
