/// <reference lib="webworker" />
/**
 * Lane Log service worker.
 *
 * Two jobs: keep the app usable with no signal, and receive push
 * notifications. The precache manifest is injected by vite-plugin-pwa at build
 * time, so hashed assets stay in step with the build.
 */

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every in-app route is served by the one shell document.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// The Tesseract model is a large, immutable, cross-origin download. Caching it
// is what makes a second scan work on alley wifi.
registerRoute(
  ({ url }) => /tesseract|tessdata|\.traineddata/.test(url.href),
  new CacheFirst({ cacheName: 'ocr-models' }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 5 }),
);

self.addEventListener('message', (event) => {
  // Lets the update prompt in the client activate a waiting worker.
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);

  // Safari drops a push that does not result in a visible notification and
  // will eventually revoke the subscription, so always show something.
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Lane Log', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: payload.tag ?? 'lane-log',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.url as string) ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Focus an open window rather than stacking up new ones.
      for (const client of clients) {
        if (new URL(client.url).pathname === target && 'focus' in client) {
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});

/** A push body may be JSON, plain text, or absent entirely. */
function readPayload(data: PushMessageData | null): PushPayload {
  if (!data) return {};
  try {
    return data.json() as PushPayload;
  } catch {
    const text = data.text();
    return text ? { body: text } : {};
  }
}
