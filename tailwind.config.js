/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10233B',
        surface: '#FFFFFF',
        bg: '#F7F9FA',
        border: '#D8DEE4',
        accent: '#0E7C7B',
        'accent-dark': '#0A5F5E',
        danger: '#B3261E',
        success: '#1B7A43',
        warning: '#9A6700'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}
