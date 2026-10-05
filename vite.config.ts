import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: офлайн-режим, автообновление, манифест на русском.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'BookApp — читалка PDF',
        short_name: 'BookApp',
        description: 'Удобная читалка PDF-книг с сохранением прогресса, заметками и статистикой',
        lang: 'ru',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // pdf.worker — тяжёлый, кэшируем его тоже (glob выше не берёт mjs из node_modules)
        runtimeCaching: [
          {
            urlPattern: /pdf\.worker.*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Превью-окружение работает на прокси-хосте e2b.app — разрешаем любой Host
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdfjs-dist'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'dexie', 'dexie-react-hooks', 'zustand'],
        },
      },
    },
  },
});
