/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'police-red': '#dc2626',
        'police-dark': '#1f2937',
        'police-gray': '#374151',
        'alert-high': '#ef4444',
        'alert-medium': '#f59e0b',
        'alert-low': '#10b981',
      },
    },
  },
  plugins: [],
}
