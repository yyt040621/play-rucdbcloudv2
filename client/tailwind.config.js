/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 浅色主题
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F9FAFB',
        },
        // 深色主题
        dark: {
          DEFAULT: '#1E1E2E',
          secondary: '#181825',
          surface: '#313244',
          text: '#CDD6F4',
          'text-secondary': '#A6ADC8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
