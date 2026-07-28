import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served from the domain root by Firebase Hosting. This was '/room-selector/'
  // for GitHub Pages; leaving it that way makes the SPA rewrite swallow every
  // asset request and return index.html, which renders a blank page.
  base: '/',
})
