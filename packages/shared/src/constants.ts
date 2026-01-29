// ============================================================================
// Color Palette
// ============================================================================

export const COLORS = {
  charcoal: '#1F2933',
  offWhite: '#F7F7F5',
  softGold: '#C4A15A',
  redDrain: '#DC2626', // system red
  greenReclaimed: '#16A34A', // system green
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
} as const;

// ============================================================================
// Card Brand Colors
// ============================================================================

export const CARD_BRAND_COLORS = {
  Visa: '#1A1F71',
  Mastercard: '#EB001B',
  Amex: '#006FCF',
  Discover: '#FF6000',
  Bank: '#6B7280',
  Unknown: '#9CA3AF',
} as const;

// ============================================================================
// Feature Flags
// ============================================================================

export const FEATURE_FLAGS = {
  PLAID: 'FEATURE_PLAID',
  APPSTORE: 'FEATURE_APPSTORE',
} as const;

// ============================================================================
// Date Formats
// ============================================================================

export const DATE_FORMATS = {
  MONTH: 'YYYY-MM',
  DISPLAY: 'MMM DD, YYYY',
  FULL: 'YYYY-MM-DD HH:mm:ss',
} as const;

// ============================================================================
// Email Patterns (for parsing)
// ============================================================================

export const EMAIL_PATTERNS = {
  TRIAL_KEYWORDS: [
    'free trial',
    'trial period',
    'trial ends',
    'trial will end',
    'trial expires',
    'start your subscription',
  ],
  RECEIPT_KEYWORDS: [
    'receipt',
    'payment confirmation',
    'subscription renewed',
    'billing confirmation',
    'your payment',
  ],
  AMOUNT_PATTERN: /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
  DATE_PATTERN: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
} as const;

// ============================================================================
// API Limits
// ============================================================================

export const API_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_RESULTS_PER_PAGE: 100,
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: 100,
} as const;
