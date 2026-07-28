/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Selecta-bot design system: atomic-age chrome outside, modern
        // mechanism design inside. Cream enamel surfaces, one teal, one
        // coral, brass for warnings. Money/fairness UI keeps semantic
        // green/red — retro flourish never touches what people pay.
        selecta: {
          cream: '#FAF3E3',
          paper: '#FFFDF6',
          ink: '#26262E',
          slate: '#5A5A66',
          chrome: '#B9BFC8',
          teal: '#177E71',
          'teal-dark': '#0F5F55',
          'teal-light': '#E2F1ED',
          coral: '#E2593F',
          'coral-dark': '#C74830',
          'coral-light': '#FBEAE5',
          brass: '#C98A1B',
          'brass-light': '#FBF3DC',
        },
      },
      fontFamily: {
        // Futura is the atomic-age face and ships with macOS/iOS; the rest
        // of the stack degrades gracefully. Display use only (headings).
        display: ['Futura', '"Century Gothic"', '"Avenir Next"', 'Inter',
          'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Flat offset shadow, like a printed midcentury ad.
        selecta: '0 4px 0 0 rgba(38, 38, 46, 0.12)',
      },
    },
  },
  plugins: [],
}
