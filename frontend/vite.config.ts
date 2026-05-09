import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/competitions': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/competitors': 'http://localhost:3000',
      '/mats': 'http://localhost:3000',
      '/public': 'http://localhost:3000',
      '/scoreboard': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
