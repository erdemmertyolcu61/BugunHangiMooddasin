import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Ayrı config: prod vite.config.js'teki PWA/sitemap eklentilerini testlerde
// çalıştırmadan, yalnızca React + jsdom ortamıyla birim testleri koşar.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
