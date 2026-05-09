import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { IncomingMessage } from 'http'

// Some frontend routes share a path prefix with backend API routes —
// /competitions/:id/register is a React page, /competitions/:id/competitors
// is a backend POST endpoint. The proxy must distinguish them. We bypass
// the proxy for browser navigations (Accept: text/html) so vite's SPA
// fallback serves index.html and React Router takes over. API calls
// (Accept: */*, Accept: application/json) still get proxied.
function passToFrontend(req: IncomingMessage) {
  if (req.headers.accept?.includes('text/html')) {
    return req.url ?? '/index.html'
  }
}

const sharedPrefix = {
  target: 'http://localhost:3000',
  bypass: passToFrontend,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/auth': sharedPrefix,
      '/competitions': sharedPrefix,
      '/categories': sharedPrefix,
      '/competitors': sharedPrefix,
      '/mats': sharedPrefix,
      '/public': sharedPrefix,
      '/scoreboard': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
