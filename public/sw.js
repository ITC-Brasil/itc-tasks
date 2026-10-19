// ADR-054: service worker próprio — shell e última versão vista de cada tela, sem edição offline; push (ADR-050)
// ADR-064: telas só valem enquanto a sessão valeria (7 dias, padrão do Better Auth)
const CACHE_VERSION = "v2";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
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
          // sessão expirada: as telas guardadas são de quem já não está logado
          // navegação não segue redirect (opaqueredirect): todo redirect do app vai ao /login
          if (
            res.status === 401 ||
            res.type === "opaqueredirect" ||
            (res.redirected && new URL(res.url).pathname === "/login")
          ) {
            event.waitUntil(clearPages());
          } else if (res.ok && !res.redirected) {
            event.waitUntil(savePage(request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (
            (await freshMatch(cache, request)) ||
            (await freshMatch(cache, "/")) ||
            new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
          );
        }),
    );
  }
});

function clearPages() {
  return caches
    .keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k))));
}

async function savePage(request, res) {
  const headers = new Headers(res.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  const copy = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
  await (await caches.open(PAGES)).put(request, copy);
}

// tela sem data ou acima do prazo sai do cache
async function freshMatch(cache, key) {
  const hit = await cache.match(key);
  if (!hit) return null;
  if (Date.now() - Number(hit.headers.get("x-sw-cached-at") || 0) <= MAX_AGE) return hit;
  await cache.delete(key);
  return null;
}

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

