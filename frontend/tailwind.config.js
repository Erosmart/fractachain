/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-lato)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['var(--font-lato)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        section: ['var(--font-lato)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        body: ['var(--font-lato)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        lcd: ['var(--font-lcd)', 'ui-monospace', 'monospace'],
      },
      colors: {
        leaf: {
          50: '#f4fbf0',
          100: '#e4f3db',
          200: '#cfe8c4',
          400: '#8fcb7a',
        },
        brand: {
          dark: '#111111',
          card: '#ffffff',
          border: '#e7e7e7',
          accent: '#6fa85c',
        },
      },
    },
  },
  plugins: [],
};
