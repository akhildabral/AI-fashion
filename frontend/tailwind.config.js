/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Studio workspace (light)
        ink: '#1A1912',
        bone: '#F7F6F2',
        surface: '#FFFFFF',
        iris: { DEFAULT: '#4B3BE4', soft: '#EFEDFF' },
        spark: { DEFAULT: '#FF6A3D', soft: '#FFEDE6' },
        // Spotlight theater (dark) — used only on try-on / reveal surfaces
        theater: {
          DEFAULT: '#0C0B0F',
          surface: '#191820',
          iris: '#9385FF',
          rose: '#E5476D',
          spark: '#FF855C',
          mist: '#A9A5B2',
        },
        // Transitional alias: legacy pages referenced `clay` as the accent.
        // Points at iris until every screen is reskinned, then dies.
        clay: '#4B3BE4',
        sage: '#8a9a86',
      },
      boxShadow: {
        lift: '0 12px 26px -18px rgba(75, 59, 228, 0.55)',
        card: '0 18px 34px -22px rgba(0, 0, 0, 0.3)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { filter: 'blur(0)' },
          '40%': { filter: 'blur(4px)', transform: 'scale(1.02)' },
          '100%': { filter: 'blur(0)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'rise-1': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.06s both',
        'rise-2': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s both',
        'rise-3': 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.18s both',
        shimmer: 'shimmer 1s ease',
      },
    },
  },
  plugins: [],
}
