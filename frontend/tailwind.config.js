/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          active: '#1e3a5f',
        },
        brand: {
          DEFAULT: '#10b981',
          light: '#34d399',
          dark: '#059669',
        },
      },
    },
  },
  plugins: [],
}
