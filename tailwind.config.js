/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-primary)',
        surface: 'var(--bg-secondary)',
        card: 'var(--bg-card)',
        hover: 'var(--bg-hover)',
        border: 'var(--border-color)',
        'border-highlight': 'var(--border-highlight)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          glow: 'var(--accent-glow)',
        },
        status: {
          emerald: 'var(--emerald)',
          'emerald-bg': 'var(--emerald-bg)',
          ruby: 'var(--ruby)',
          'ruby-bg': 'var(--ruby-bg)',
          amber: 'var(--amber)',
          'amber-bg': 'var(--amber-bg)',
          cyan: 'var(--cyan)',
          'cyan-bg': 'var(--cyan-bg)',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif'
        ],
      },
    },
  },
  plugins: [],
};
