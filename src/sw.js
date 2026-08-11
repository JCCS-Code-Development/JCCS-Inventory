import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Take over immediately when a new SW is installed — no waiting for tabs to close
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Runtime cache: API reads, so recently-viewed stock stays visible offline
registerRoute(
  ({ url }) => /\/api\/(?:items|locations|vendors|reports)\//.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-reads-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)
