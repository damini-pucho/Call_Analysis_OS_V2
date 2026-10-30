/** @type {import('tailwindcss').Config} */
// Every colour and radius resolves to a variable in src/tokens.css (the Pucho Design System, tone "pucho").
// No component names a hex value.
const NEUTRAL = {
  50: 'var(--surface-2)', 100: 'var(--surface-2)', 200: 'var(--line)', 300: 'var(--line-strong)', 400: 'var(--ink-4)',
  500: 'var(--ink-3)', 600: 'var(--ink-2)', 700: 'var(--ink-2)', 800: 'var(--ink)', 900: 'var(--ink)',
};
const STATUS = (k) => ({ DEFAULT: `var(--${k})`, text: `var(--${k}-text)`, soft: `var(--${k}-soft)`, edge: `var(--${k}-edge)` });

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-app)'],
        mono: ['var(--font-mono-app)'],
        display: ['var(--font-display-app)'],
      },
      colors: {
        gray: NEUTRAL,
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)', 4: 'var(--ink-4)' },
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        canvas: 'var(--bg)',
        line: { DEFAULT: 'var(--line)', soft: 'var(--line-soft)', strong: 'var(--line-strong)' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        primary: { DEFAULT: 'var(--primary)', on: 'var(--on-primary)' },
        nav: { DEFAULT: 'var(--nav-bg)', ink: 'var(--nav-ink)', 2: 'var(--nav-ink-2)', line: 'var(--nav-line)', hover: 'var(--nav-hover)', active: 'var(--nav-active-bg)' },
        ok: STATUS('ok'), warn: STATUS('warn'), bad: STATUS('bad'), info: STATUS('info'),
        cat: { 1: 'var(--cat-1)', 2: 'var(--cat-2)', 3: 'var(--cat-3)', 4: 'var(--cat-4)', 5: 'var(--cat-5)', 6: 'var(--cat-6)', 7: 'var(--cat-7)', 8: 'var(--cat-8)' },
      },
      borderRadius: {
        DEFAULT: 'var(--radius-xs)', xs: 'var(--radius-xs)', sm: 'var(--radius-xs)', md: 'var(--radius-sm)',
        lg: 'var(--radius-sm)', xl: 'var(--radius)', '2xl': 'var(--radius-lg)', '3xl': 'var(--radius-lg)',
      },
      boxShadow: { none: 'none', float: 'var(--float-shadow)', lift: 'var(--card-lift)', toast: 'var(--toast-shadow)' },
    },
  },
  // tones are composed at runtime (`bg-${tone}-soft`), so Tailwind is told about them
  safelist: ['ok', 'warn', 'bad', 'info'].flatMap((t) => [`bg-${t}-soft`, `text-${t}-text`, `bg-${t}`, `border-${t}-edge`, `text-${t}`]),
  plugins: [],
};
