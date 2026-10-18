// ADR-054: service worker próprio — shell e última versão vista de cada tela, sem edição offline; push (ADR-050)
const CACHE_VERSION = "v1";
const PAGES = `pages-${CACHE_VERSION}`;
const STATIC = `static-${CACHE_VERSION}`;
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/brand/", "/splash/", "/favicon"];
const BYPASS_PREFIXES = ["/api/", "/mcp", "/login"];

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão — ITC Tasks</title><body style="font-family:system-ui,sans-serif;background:#F5F0E8;color:#1A2020;display:grid;place-items:center;min-height:100dvh;margin:0;padding:16px;text-align:center"><main><h1 style="font-size:20px">Sem conexão</h1><p>Esta tela ainda não foi aberta neste aparelho. Conecte-se e tente de novo.</p></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;
  if (request.headers.has("RSC")) return;

  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // redirecionamento (login) não é tela da pessoa
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (
            (await cache.match(request, { ignoreSearch: false })) ||
            (await cache.match("/")) ||
            new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
          );
        }),
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "ITC Tasks", {
      body: data.body,
      icon: "/icons/apple-touch-icon.png",
      badge: "/icons/icon-192-monochrome.png",
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

