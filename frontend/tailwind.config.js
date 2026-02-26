/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          400: '#94a3b8',
          500: '#64748b',
          700: '#334155',
          900: '#0f172a',
        },
        success: {
          50: '#ecfdf5',
          600: '#059669',
          700: '#047857',
        },
        danger: {
          50: '#fef2f2',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      borderRadius: {
        ds: '10px',
        'ds-lg': '14px',
      },
      boxShadow: {
        ds: '0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.08)',
        popover: '0 14px 28px rgba(15, 23, 42, 0.12)',
      },
      transitionTimingFunction: {
        expressive: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Syne', 'ui-sans-serif', 'sans-serif'],
      },
      lineHeight: {
        xs: '1.5',
        sm: '1.5',
        md: '1.6',
        lg: '1.5',
        xl: '1.3',
        '2xl': '1.1',
      },
      letterSpacing: {
        xs: '0.01em',
        sm: '-0.01em',
        md: '-0.01em',
        lg: '-0.02em',
        xl: '-0.03em',
        '2xl': '-0.04em',
      },
    },
  },
  plugins: [],
}
