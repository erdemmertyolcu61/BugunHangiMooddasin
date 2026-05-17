import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'audio/*.mp3'],
      manifest: false, // public/manifest.json'u kullan
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/repository\/movies\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mood-movies-v1',
              expiration: { maxEntries: 500, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/movies\/\d+\/analyze/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'movie-analysis-v1',
              expiration: { maxEntries: 300, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/image-proxy/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posters-v1',
              expiration: { maxEntries: 400, maxAgeSeconds: 2592000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/lists/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lists-v1',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3005,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
      },
    },
  },
})
