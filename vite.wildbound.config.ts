import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Wildbound-only build -> dist-wildbound (assets copied by the build script)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  define: { 'import.meta.env.VITE_WB_STANDALONE': JSON.stringify('1') },
  publicDir: false,
  build: {
    outDir: 'dist-wildbound',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: path.resolve(import.meta.dirname, 'wildbound.html') },
  },
})
