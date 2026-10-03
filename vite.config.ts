import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs. The desktop app is loaded over `file://`, where an
  // absolute `/assets/...` would resolve to the filesystem root and 404. This
  // is equally correct for the web build, which is served from the domain root
  // (Netlify), because index.html sits at that root.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5121,
    strictPort: true,
  },
  preview: {
    port: 5121,
    strictPort: true,
  },
})
