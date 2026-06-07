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
      manifest: false, // public/manifest.json'u kullan
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,avif,webp}'],
        importScripts: ['/push-sw.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/share/, /^\/youtube/],
        runtimeCaching: [
          {
            // index.html → her zaman network'ten al, offline'da cache fallback
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-nav-v1',
              expiration: { maxEntries: 10, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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

  // ═══════════════════════════════════════════════════════════
  // PRODUCTION BUILD OPTIMIZATION
  // ═══════════════════════════════════════════════════════════
  build: {
    // Target modern browsers — enables native async/await, optional chaining,
    // nullish coalescing without polyfills. Smaller bundle.
    target: ['es2020', 'chrome87', 'firefox78', 'safari14', 'edge88'],

    // Enable minification (Vite 8 uses oxc by default)
    minify: true,

    // Source maps only in development
    sourcemap: false,

    // Chunk splitting strategy for optimal caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },

    // Asset inlining threshold — inline small assets to reduce HTTP requests
    assetsInlineLimit: 4096, // 4KB

    // Chunk size warning
    chunkSizeWarningLimit: 500,
  },

  // ═══════════════════════════════════════════════════════════
  // DEV SERVER
  // ═══════════════════════════════════════════════════════════
  server: {
    port: 3005,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
      },
      '/uploads': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
})
