/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        brand: {
          50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE',
          500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8',
        },
        accent: {
          500: '#7C3AED', 600: '#6D28D9',
        },
        surface: {
          light: '#FFFFFF', dark: '#1A1D2E',
          alt: { light: '#F4F6F8', dark: '#232738' },
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        'card-lg': '0 4px 14px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
