/**
 * Design tokens live as CSS variables (`src/styles/global.css`, light and
 * dark); Tailwind only names them. Colors are RGB channels so opacity
 * modifiers work (`bg-sky/20`).
 *
 * @type {import('tailwindcss').Config}
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        // Legacy aliases: every face is the same UI sans now.
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        section: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        lcd: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2') },
        muted: token('muted'),
        navy: { DEFAULT: token('navy'), ink: token('navy-ink') },
        sky: { DEFAULT: token('sky'), strong: token('sky-strong'), soft: token('sky-soft') },
        peach: { DEFAULT: token('peach'), soft: token('peach-soft') },
        butter: { DEFAULT: token('butter'), soft: token('butter-soft') },
        'on-pastel': token('on-pastel'),
        good: { DEFAULT: token('good'), soft: token('good-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft') },
        /** Categorical data slots, fixed order (validated for CVD in both themes). */
        viz: { 1: token('viz-1'), 2: token('viz-2'), 3: token('viz-3'), 4: token('viz-4') },
        // Legacy names still used by pages not yet migrated: mapped onto the new palette.
        leaf: { 50: token('sky-soft'), 100: token('sky-soft'), 200: token('sky'), 400: token('sky-strong') },
        brand: {
          dark: token('ink'),
          card: token('surface'),
          border: token('line'),
          accent: token('sky-strong'),
        },
      },
      borderRadius: {
        card: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--ink) / 0.04), 0 12px 32px -24px rgb(var(--ink) / 0.18)',
        lift: '0 2px 4px rgb(var(--ink) / 0.05), 0 18px 40px -22px rgb(var(--ink) / 0.28)',
      },
      letterSpacing: {
        numeral: '-0.045em',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
