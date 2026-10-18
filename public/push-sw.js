// ADR-050: service worker mínimo para Web Push; o Serwist (Módulo 11, `public/sw.js`) assume o push
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "ITC Tasks", {
      body: data.body,
      icon: "/icons/apple-touch-icon.png",
      badge: "/icons/apple-touch-icon.png",
      data: { url: data.url || "/notificacoes" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
      return tab ? tab.navigate(url).then((t) => t && t.focus()) : self.clients.openWindow(url);
    }),
  );
});
