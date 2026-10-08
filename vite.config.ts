/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Relative base so the built app works from any static host or sub-path.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // Automatic file shrinker for the app's own images at build time.
    ViteImageOptimizer({
      test: /.(png|jpe?g|webp)$/i,
      png: { quality: 90 },
      jpeg: { quality: 82, mozjpeg: true },
      webp: { quality: 85 },
      logStats: true,
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-*.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'YOUrigin — Your Creative Codex',
        short_name: 'YOUrigin',
        description: 'Where your ideas become something.',
        theme_color: '#130f19',
        background_color: '#130f19',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
