import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/anima-prompt-tool/',
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: '/anima-prompt-tool/', name: 'Anima Prompt Tool', short_name: 'Anima Prompt',
      description: '使うたびに育つ、自分だけのタグパレット。', lang: 'ja',
      start_url: '/anima-prompt-tool/', scope: '/anima-prompt-tool/', display: 'standalone',
      theme_color: '#667653', background_color: '#f7f8f3',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { cleanupOutdatedCaches: true, globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], navigateFallback: '/anima-prompt-tool/index.html' },
  })],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
