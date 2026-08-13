self.addEventListener('install', function (event) {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url)

  if (url.pathname.startsWith('/api/')) {
    return
  }

  event.respondWith(
    fetch(event.request).catch(function () {
      if (event.request.mode === 'navigate') {
        return caches.match('/offline.html')
      }

      throw new Error('Network error')
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const targetUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/inbox'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
