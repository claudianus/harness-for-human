/// <reference lib="webworker" />
// 서비스 워커: 오프라인 실행(빌드 결과 전체를 미리 캐시) + 알림 클릭 처리
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// 해시 라우팅이라 모든 화면 이동은 index.html 하나로 온다
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// 바닐라 버전(v1)이 쓰던 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('human-harness-v1'));
});

// 알림을 누르면: 열려 있는 앱 창을 앞으로 가져와 해당 화면으로, 없으면 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route: string = event.notification.data?.route || '/now';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      win.postMessage({ type: 'navigate', route });
      return;
    }
    await self.clients.openWindow(`${self.registration.scope}#${route}`);
  })());
});
