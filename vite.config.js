import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages a app vive em /<nome-do-repo>/ (definido no workflow).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'push-sw.js'],
      manifest: {
        name: 'Nós Dois',
        short_name: 'Nós Dois',
        description: 'Calendário, tarefas, compras e datas especiais — só para os dois.',
        lang: 'pt-PT',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#f6f3ef',
        theme_color: '#f6f3ef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
