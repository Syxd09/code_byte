import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['says-points-cemetery-beef.trycloudflare.com']
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})