export const colors = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  text: '#0f172a',
  textMuted: '#475569',
  border: '#e2e8f0',
  borderMuted: '#f1f5f9',
  brand: '#2563eb',
  brandHover: '#1d4ed8',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
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
    body: "'Inter', ui-sans-serif, system-ui, sans-serif",
    display: "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif",
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const shadow = {
  card: '0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.08)',
  popover: '0 14px 28px rgba(15, 23, 42, 0.12)',
} as const;

export const motion = {
  duration: {
    fast: '120ms',
    normal: '180ms',
    slow: '280ms',
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    expressive: 'cubic-bezier(0.22, 1, 0.36, 1)',
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
