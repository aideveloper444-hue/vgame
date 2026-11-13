import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // also run on older iPhones / iPads (Safari 14+), not just the newest browsers
  build: { target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Gradle locks files under android/ while it builds, which crashes the file watcher on Windows
    watch: { ignored: ['**/android/**', '**/dist/**', '**/unreal_assets/**'] },
  },
})
