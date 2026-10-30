// The app's service worker, which only shows the daily reminder
// (docs/plans/notifications.md). It has no fetch handler and caches nothing,
// so loading and updating the app work just as they would without it.

// Every push must show a notification: iOS stops delivering to a web app
// that receives pushes silently.
self.addEventListener('push', (event) => {
  let title = 'Content Tracker'
  try {
    title = event.data?.json().title || title
  } catch {
    // Not the JSON the daily-reminder function sends; show the app's name.
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      icon: 'icon-192.png',
      // A new reminder replaces yesterday's if it's still there, and still
      // alerts.
      tag: 'daily-reminder',
      renotify: true,
    }),
  )
})

// Tapping it brings an open window of the app forward, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.registration.scope))
      return open ? open.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
