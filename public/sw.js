// Minimal service worker — exists so the order-tracking page can show
// system notifications (Android Chrome requires notifications to go
// through a service worker registration).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tapping the notification focuses the existing tab (or opens one).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => !url || t.url.includes(url)) ?? tabs[0];
      if (tab) return tab.focus();
      if (url) return self.clients.openWindow(url);
    })
  );
});
