/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Atelier: Bodoni Moda (Vogue display serif) + Archivo (UI/body).
        display: ['"Bodoni Moda"', 'Georgia', 'serif'],
        // The wordmark only: the brand's own face.
        brand: ['"Playfair Display"', 'Georgia', 'serif'],
        serif: ['"Bodoni Moda"', 'Georgia', 'serif'],
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Themed via CSS variables (gallery-by-day in :root, atelier-by-night in .dark).
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        bone: 'rgb(var(--c-bone) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        // iris === brass (the accent), kept named so existing markup re-skins.
        iris: {
          DEFAULT: 'rgb(var(--c-iris) / <alpha-value>)',
          deep: 'rgb(var(--c-iris-deep) / <alpha-value>)',
          deeper: 'rgb(var(--c-iris-deeper) / <alpha-value>)',
          soft: 'rgb(var(--c-iris-soft) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'rgb(var(--c-iris) / <alpha-value>)',
          ink: 'rgb(var(--c-iris-deeper) / <alpha-value>)',
        },
        spark: {
          DEFAULT: 'rgb(var(--c-spark) / <alpha-value>)',
          deep: 'rgb(var(--c-spark-deep) / <alpha-value>)',
          soft: 'rgb(var(--c-spark-soft) / <alpha-value>)',
        },
        // Legacy aliases → brass, so un-swept corners don't break.
        clay: 'rgb(var(--c-iris) / <alpha-value>)',
        sage: 'rgb(var(--c-spark) / <alpha-value>)',
        theater: {
          DEFAULT: '#0E0D0B',
          surface: '#1A1714',
          iris: 'rgb(var(--c-iris))',
          rose: 'rgb(var(--c-iris))',
          spark: 'rgb(var(--c-spark))',
          mist: 'rgb(var(--c-ink))',
        },
      },
      boxShadow: {
        // Floating layers only (menus, sheets, toasts) — never resting cards.
        float: '0 24px 60px -30px rgba(0, 0, 0, 0.7)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'rise-1': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.06s both',
        'rise-2': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s both',
        'rise-3': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.18s both',
        'rise-4': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.24s both',
        'rise-5': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.3s both',
        'rise-6': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.36s both',
      },
    },
  },
  plugins: [],
}
