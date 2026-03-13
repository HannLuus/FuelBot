/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()

// Injected by VitePWA at build time
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Supabase API — network first, 5 min cache
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  }),
)

// Map tiles — cache first, 24h
registerRoute(
  ({ url }) => /\.(openstreetmap|cartocdn)\.(org|com)$/.test(url.hostname),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 })],
  }),
)

// Web Push: show a notification when a push event is received from the server
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload: { title?: string; body?: string; url?: string; icon?: string } = {}
  try {
    payload = event.data.json() as typeof payload
  } catch {
    payload = { title: 'FuelBot', body: event.data.text() }
  }

  const title = payload.title ?? 'FuelBot'
  const options: NotificationOptions = {
    body: payload.body ?? 'Fuel is back in stock at a station you follow.',
    icon: payload.icon ?? '/FuelbotLogo.png',
    badge: '/FuelbotLogo.png',
    data: { url: payload.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Open the app (or focus an existing tab) when a notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl: string = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus()
          }
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})
