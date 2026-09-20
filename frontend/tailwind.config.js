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
        display: ['Syne', 'Avenir Next', 'sans-serif'],
        section: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Source Serif 4"', 'Georgia', 'serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        lcd: ['Share Tech Mono', 'ui-monospace', 'monospace'],
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
