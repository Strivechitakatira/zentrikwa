import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base:    'hsl(var(--bg-base))',
        surface: 'hsl(var(--bg-surface))',
        elevated:'hsl(var(--bg-elevated))',
        sidebar: {
          DEFAULT: 'hsl(var(--bg-sidebar))',
          hover:   'hsl(var(--bg-sidebar-hover))',
          active:  'hsl(var(--bg-sidebar-active))',
          border:  'hsl(var(--border-sidebar))',
          text:    'hsl(var(--text-sidebar))',
        },
        border:  'hsl(var(--border))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          hover:   'hsl(var(--accent-hover))',
          subtle:  'hsl(var(--accent-subtle))',
          text:    'hsl(var(--accent-text))',
        },
        txt: {
          primary:   'hsl(var(--text-primary))',
          secondary: 'hsl(var(--text-secondary))',
          muted:     'hsl(var(--text-muted))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          subtle:  'hsl(var(--success-subtle))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          subtle:  'hsl(var(--warning-subtle))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          subtle:  'hsl(var(--danger-subtle))',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
