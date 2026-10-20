/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // тёплая «пивная» палитра
        cream: { 50: '#fdfbf7', 100: '#f8f4ec', 200: '#efe8da', 300: '#e2d8c4' },
        ink: { 900: '#2a1f16', 800: '#3b2c20', 700: '#54402f', 600: '#6f5a47', 500: '#8c7762', 400: '#ab9a88', 300: '#c9bdaf' },
        amber: {
          50: '#fff8eb', 100: '#feecc7', 200: '#fcd78b', 300: '#fabd4d',
          400: '#f6a41f', 500: '#e8890c', 600: '#cc6a07', 700: '#a94d0a', 800: '#883d0f', 900: '#6f3410'
        }
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Inter', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', 'Georgia', 'serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(60,40,20,.06), 0 1px 3px rgba(60,40,20,.05)',
        pop: '0 12px 40px rgba(42,31,22,.22)'
      }
    }
  },
  plugins: []
}
