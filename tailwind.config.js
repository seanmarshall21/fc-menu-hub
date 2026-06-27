/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm accent (was blue). 600 is the readable text/button orange;
        // the footer + assistant use the brighter golden gradient as a fill.
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
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
