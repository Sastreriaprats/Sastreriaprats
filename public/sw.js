var CACHE_VERSION = 'prats-v7'
var STATIC_CACHE = CACHE_VERSION + '-static'
var DYNAMIC_CACHE = CACHE_VERSION + '-dynamic'
var API_CACHE = CACHE_VERSION + '-api'
var OFFLINE_URL = '/offline.html'

var PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) { return cache.addAll(PRECACHE_ASSETS) })
  )
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.startsWith('prats-') && !k.startsWith(CACHE_VERSION) })
            .map(function (k) { return caches.delete(k) })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', function (event) {
  var request = event.request
  var url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Estas rutas nunca deben ser interceptadas por el SW — el navegador las maneja directamente
  if (
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/pos') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.startsWith('/__nextjs') ||
    url.pathname.includes('hot-update') ||
    url.pathname.startsWith('/_next/static/development')
  ) {
    return
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE, 8000))
    return
  }

  event.respondWith(networkFirst(request, DYNAMIC_CACHE, 3000))
})

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached
    return fetch(request).then(function (response) {
      if (response.ok) {
        var cloned = response.clone()
        caches.open(cacheName).then(function (cache) { cache.put(request, cloned) })
      }
      return response
    }).catch(function () {
      return new Response('Offline', { status: 503 })
    })
  })
}

function networkFirst(request, cacheName, timeout) {
  var controller = new AbortController()
  var timer = setTimeout(function () { controller.abort() }, timeout)

  return fetch(request, { signal: controller.signal }).then(function (response) {
    clearTimeout(timer)
    if (response.ok) {
      var cloned = response.clone()
      caches.open(cacheName).then(function (cache) { cache.put(request, cloned) })
    }
    return response
  }).catch(function () {
    clearTimeout(timer)
    return caches.match(request).then(function (cached) {
      if (cached) return cached
      if (request.mode === 'navigate') return caches.match(OFFLINE_URL)
      return new Response('Offline', { status: 503 })
    })
  })
}

function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then(function (cached) {
    var fetchPromise = fetch(request).then(function (response) {
      if (response.ok) {
        var cloned = response.clone()
        caches.open(cacheName).then(function (c) { c.put(request, cloned) })
      }
      return response
    }).catch(function () { return null })

    if (cached) return cached
    return fetchPromise.then(function (resp) {
      return resp || caches.match(OFFLINE_URL)
    })
  })
}

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)(\?.*)?$/.test(pathname) ||
    pathname.startsWith('/_next/static/')
}

self.addEventListener('push', function (event) {
  var data = { title: 'Sastrería Prats', body: 'Nueva notificación', url: '/admin/dashboard' }
  if (event.data) { try { data = Object.assign({}, data, event.data.json()) } catch (e) { /* ignore */ } }

  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url },
    tag: data.tag || 'default',
    renotify: true,
    actions: [{ action: 'open', title: 'Ver' }, { action: 'dismiss', title: 'Cerrar' }],
  }))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  if (event.action === 'dismiss') return
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/admin/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (new URL(clients[i].url).pathname === url && 'focus' in clients[i]) return clients[i].focus()
      }
      return self.clients.openWindow(url)
    })
  )
})

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-pos-sales') {
    event.waitUntil(syncPendingSales())
  }
})

function syncPendingSales() {
  return caches.open('prats-offline-queue').then(function (cache) {
    return cache.keys().then(function (requests) {
      return Promise.all(requests.map(function (request) {
        return cache.match(request).then(function (response) {
          if (!response) return
          return response.json().then(function (data) {
            return fetch('/api/pos/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            }).then(function () {
              return cache.delete(request)
            })
          })
        })
      }))
    })
  }).catch(function (e) { console.error('Sync failed:', e) })
}
