import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built app works from GitHub Pages, a sub-folder, or file://
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
})
