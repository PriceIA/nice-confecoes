import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nice: {
          50:  '#f0f9ee',
          100: '#d9f0d4',
          200: '#b4e0ab',
          300: '#82c977',
          400: '#5ab84a',
          500: '#3a8c2f',
          600: '#2d6e24',
          700: '#235720',
          800: '#1e2d1b',
          900: '#162014',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
export default config
