/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import pkg from './package.json' with { type: 'json' };

/**
 * The public portfolio page (p/index.html) is a separate, standalone page:
 * in the build it gets a strict Content-Security-Policy that only allows
 * talking to the portfolio API and loading its pictures, and it never gets
 * the app's manifest or service-worker registration.
 */
function portfolioPage(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabase = new URL(env.VITE_SUPABASE_URL || 'https://yikoymzktspamahrsuje.supabase.co').origin;
  const api = env.VITE_PORTFOLIO_API ? new URL(env.VITE_PORTFOLIO_API).origin : supabase;
  const sources = [...new Set([supabase, api])].join(' ');
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: ${sources}`,
    `connect-src ${sources}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'yourigin-portfolio-page',
    apply: 'build',
    enforce: 'post',
    // Runs after every other plugin has written the page (the PWA plugin adds its manifest link late).
    generateBundle(_options, bundle) {
      const page = bundle['p/index.html'];
      if (!page || page.type !== 'asset') return;
      page.source = String(page.source)
        .replace('<!-- %PORTFOLIO_CSP% -->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
        .replace(/\s*<link rel="manifest"[^>]*>/g, '')
        .replace(/\s*<script[^>]*registerSW[^>]*><\/script>/g, '');
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative base so the built app works from any static host or sub-path.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    portfolioPage(mode),
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
      // Icons are already precached by globPatterns. Listing them again here (or via the
      // manifest icons) adds a second, pre-optimizer revision of the same URL, and Workbox
      // then throws on the conflict — the worker activates but caches nothing.
      includeManifestIcons: false,
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
        // YOUrigin appears in the phone's Share menu; public/share-target.js receives it.
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*'] }] },
        },
        // Long-press the app icon.
        shortcuts: [
          { name: 'Capture', short_name: 'Capture', url: './#/?focus=1', icons: [{ src: 'favicon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Speak a piece', short_name: 'Speak', url: './#/?speak=1', icons: [{ src: 'favicon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Library', short_name: 'Library', url: './#/library', icons: [{ src: 'favicon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Projects', short_name: 'Projects', url: './#/projects', icons: [{ src: 'favicon-96.png', sizes: '96x96', type: 'image/png' }] },
        ],
      },
      workbox: {
        importScripts: ['share-target.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // The public portfolio page (p/) is not part of the app: the worker neither
        // caches it nor answers its navigations, so visitors and owners always get
        // the real page from the web host, and the app's index.html never stands in for it.
        globIgnores: ['p/**', 'assets/viewer-*'],
        navigateFallbackDenylist: [/\/p(\/|$)/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        viewer: fileURLToPath(new URL('./p/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
