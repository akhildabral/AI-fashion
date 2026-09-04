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
        // Semantic aliases (the design system's names). New code uses these;
        // the channel names above stay for compatibility and are retired
        // surface by surface.
        accent: {
          DEFAULT: 'rgb(var(--c-iris) / <alpha-value>)',
          hover: 'rgb(var(--c-iris-deep) / <alpha-value>)',
          text: 'rgb(var(--c-iris-deeper) / <alpha-value>)',
          wash: 'rgb(var(--c-iris-soft) / <alpha-value>)',
        },
        'on-brass': 'rgb(var(--c-on-brass) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        // DEPRECATED legacy aliases → brass, so un-swept corners don't break.
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
        // Floating layers only (menus, modals, toasts, the undo bar) — never resting cards.
        float: 'var(--shadow-float)',
      },
      // 3px everywhere; 2px is the tape thumb alone. The arch is the one curve.
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
      },
      maxWidth: {
        shell: 'var(--shell)',
        'shell-narrow': 'var(--shell-narrow)',
        'shell-wide': 'var(--shell-wide)',
      },
      // The tracked-label ladder — the brand's most-repeated gesture.
      letterSpacing: {
        'label-xs': '0.12em',
        'label-sm': '0.14em',
        label: '0.16em',
        'label-lg': '0.18em',
        'label-xl': '0.2em',
        eyebrow: '0.28em',
        'eyebrow-wide': '0.32em',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        drawer: 'var(--ease-drawer)',
        rise: 'var(--ease-rise)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          // Ends on `none`, not `translateY(0)`: a kept transform makes every risen block a stacking context and traps menus beneath later siblings.
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) backwards',
        'rise-1': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.06s backwards',
        'rise-2': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s backwards',
        'rise-3': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.18s backwards',
        'rise-4': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.24s backwards',
        'rise-5': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.3s backwards',
        'rise-6': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.36s backwards',
      },
    },
  },
  plugins: [],
}
