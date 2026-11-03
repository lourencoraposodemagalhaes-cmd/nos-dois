import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages a app vive em /<nome-do-repo>/ (definido no workflow).
const base = process.env.BASE_PATH || '/';

export default defineConfig(({ mode }) => {
  const name = loadEnv(mode, process.cwd(), '').VITE_APP_NAME || 'Nós Dois';
  return {
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'push-sw.js'],
      manifest: {
        name,
        short_name: name,
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
};
});
