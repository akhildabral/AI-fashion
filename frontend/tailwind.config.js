/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Themed via CSS variables (light values in :root, dark in .dark).
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        bone: 'rgb(var(--c-bone) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        iris: {
          DEFAULT: 'rgb(var(--c-iris) / <alpha-value>)',
          deep: 'rgb(var(--c-iris-deep) / <alpha-value>)',
          deeper: 'rgb(var(--c-iris-deeper) / <alpha-value>)',
          soft: 'rgb(var(--c-iris-soft) / <alpha-value>)',
        },
        spark: {
          DEFAULT: 'rgb(var(--c-spark) / <alpha-value>)',
          deep: 'rgb(var(--c-spark-deep) / <alpha-value>)',
          soft: 'rgb(var(--c-spark-soft) / <alpha-value>)',
        },
        // Fixed dark-stage palette (Mirror glows in dark mode).
        theater: {
          DEFAULT: '#0C0B0F',
          surface: '#191820',
          iris: '#9385FF',
          rose: '#E5476D',
          spark: '#FF855C',
          mist: '#A9A5B2',
        },
        // Transitional alias for not-yet-reskinned corners.
        clay: 'rgb(var(--c-iris) / <alpha-value>)',
        sage: '#8a9a86',
      },
      boxShadow: {
        // Reserved for floating layers only (menus, slide-overs, toasts) —
        // never for hover states or resting cards.
        float: '0 10px 30px -12px rgba(0, 0, 0, 0.25)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'rise-1': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.06s both',
        'rise-2': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s both',
        'rise-3': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.18s both',
      },
    },
  },
  plugins: [],
}
