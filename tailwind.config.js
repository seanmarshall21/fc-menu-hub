/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d3fd',
          300: '#9db0fb',
          500: '#4f6ef7',
          600: '#3b56e8',
          700: '#2c42d0',
          800: '#2236b8',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f8f9fb',
          100: '#f0f2f5',
          200: '#e4e7ec',
          300: '#d0d5dd',
        },
        ink: {
          900: '#101828',
          800: '#1d2939',
          700: '#344054',
          600: '#475467',
          500: '#667085',
          400: '#7e8fa8',
          300: '#98a2b3',
          200: '#b8c0cc',
        },
        phase: {
          build:      '#d1fae5',
          proof:      '#fef3c7',
          print_prep: '#fee2e2',
          approved:   '#e0e7ff',
        },
        phaseText: {
          build:      '#065f46',
          proof:      '#92400e',
          print_prep: '#991b1b',
          approved:   '#3730a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
