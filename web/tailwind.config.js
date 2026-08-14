export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b12',
          900: '#0b111a',
          850: '#0f1622',
          800: '#141c2b',
          700: '#1c2638',
          600: '#26324a',
          500: '#33415c',
        },
        accent: {
          DEFAULT: '#6d5ef6',
          soft: '#8b7cfb',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(109,94,246,.25), 0 8px 30px -12px rgba(109,94,246,.45)',
      },
    },
  },
  plugins: [],
};