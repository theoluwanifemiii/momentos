export const colors = {
  blue: {
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    700: '#1d4ed8',
    800: '#1e40af',
    base: '#2563eb',
  },
  slate: {
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    base: '#475569',
  },
  green: {
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    700: '#047857',
    800: '#065f46',
    base: '#059669',
  },
  amber: {
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    700: '#b45309',
    800: '#92400e',
    base: '#d97706',
  },
  red: {
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    700: '#b91c1c',
    800: '#991b1b',
    base: '#dc2626',
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
  full: 9999,
} as const;

export const typography = {
  fontFamily: {
    body: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    display: "'Syne', ui-sans-serif, sans-serif",
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
  },
  lineHeight: {
    xs: 1.5,
    sm: 1.5,
    md: 1.6,
    lg: 1.5,
    xl: 1.3,
    '2xl': 1.1,
  },
  letterSpacing: {
    xs: '0.01em',
    sm: '-0.01em',
    md: '-0.01em',
    lg: '-0.02em',
    xl: '-0.03em',
    '2xl': '-0.04em',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const shadow = {
  card: '0 1px 2px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.08)',
  popover: '0 14px 28px rgba(15,23,42,0.12)',
} as const;

export const motion = {
  duration: {
    fast: '120ms',
    normal: '180ms',
    slow: '280ms',
  },
  easing: {
    standard: 'cubic-bezier(0.4,0,0.2,1)',
    expressive: 'cubic-bezier(0.22,1,0.36,1)',
  },
} as const;

export const designTokens = {
  colors,
  spacing,
  radius,
  typography,
  shadow,
  motion,
} as const;
