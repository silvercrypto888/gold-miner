/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gold-glow': 'gold-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}