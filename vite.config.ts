import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' — 저장소 이름(= GitHub Pages 하위 경로)을 몰라도 어디에 올려도 동작한다.
// 라우팅은 해시(#/today)라서 Pages에 404 대체 페이지도 필요 없다.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      // 매니페스트와 그 아이콘은 플러그인이 알아서 미리 캐시에 넣는다
      injectManifest: {
        globPatterns: ['**/*.{js,css,html}'],
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '휴먼 하네스',
        short_name: '하네스',
        description: 'AI 하네스의 구조를 사람에게 옮긴 개인 운영 시스템',
        lang: 'ko',
        start_url: './#/today',
        scope: './',
        display: 'standalone',
        background_color: '#f5f4ef',
        theme_color: '#1f6f5c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
