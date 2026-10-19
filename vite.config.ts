import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
const base = process.env.APP_BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('APP_BASE_PATH must begin and end with /');
export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    scope: base,
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: { id: base, name: '知不知 · Know-unknown', short_name: '知不知', description: '离线可用的极简认知四象限', lang: 'zh-CN', theme_color: '#f5f4ee', background_color: '#f5f4ee', display: 'standalone', start_url: base, scope: base, icons: [ {src: 'icon-192.png', sizes:'192x192', type:'image/png'}, {src:'icon-512.png',sizes:'512x512',type:'image/png'} ] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], cleanupOutdatedCaches: true, navigateFallback: `${base}index.html` },
  })],
  test: { include: ['src/**/*.test.ts'] },
});
