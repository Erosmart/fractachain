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
        sans: ['Lato', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Lato', 'Helvetica Neue', 'Arial', 'sans-serif'],
        section: ['Lato', 'Helvetica Neue', 'Arial', 'sans-serif'],
        body: ['Lato', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Lato', 'Helvetica Neue', 'Arial', 'sans-serif'],
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
