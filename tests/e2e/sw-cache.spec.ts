import { expect, type Page, test } from "@playwright/test";
import { axe, login } from "./session";

// A20 (#33), ADR-064: telas do service worker só enquanto a sessão valeria
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(() => test.skip(!email || !password, "SEED_ADMIN_* não definidos"));
test.describe.configure({ timeout: 60_000 });

const pageKeys = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = [];
    for (const name of (await caches.keys()).filter((k) => k.startsWith("pages-")))
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });

// SW controlando a aba e "/tarefas" gravada no cache
async function cached(page: Page) {
  await login(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
  await page.goto("/tarefas");
  await expect.poll(() => pageKeys(page)).toContain("/tarefas");
}

test("offline abre do cache a tela já vista", async ({ page, context }) => {
  await cached(page);
  await context.setOffline(true);
  await page.goto("/tarefas");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeHidden();
  await context.setOffline(false);
});

test("sessão expirada, online: vai ao /login e o cache de telas fica vazio", async ({
  page,
  context,
}) => {
  await cached(page);
  await context.clearCookies();
  await page.goto("/tarefas");
  await page.waitForURL(/\/login/);
  await expect.poll(() => pageKeys(page)).toEqual([]);
});

test("tela acima do prazo, offline: página Sem conexão", async ({ page, context }) => {
  await cached(page);
  // regrava cada tela com data de 8 dias atrás
  await page.evaluate(async () => {
    const old = String(Date.now() - 8 * 24 * 60 * 60 * 1000);
    for (const name of (await caches.keys()).filter((k) => k.startsWith("pages-"))) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = (await cache.match(req))!;
        const headers = new Headers(res.headers);
        headers.set("x-sw-cached-at", old);
        await cache.put(req, new Response(await res.blob(), { status: 200, headers }));
      }
    }
  });
  await context.setOffline(true);
  await page.goto("/tarefas");
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
  await axe(page, "página Sem conexão");
  await context.setOffline(false);
  await expect.poll(() => pageKeys(page)).toEqual([]);
});

test("Sair limpa o cache de telas", async ({ browser, isMobile }) => {
  test.skip(isMobile, "só no desktop: cada login conta no limite do Better Auth");
  // sessão própria: o Sair não derruba a do storageState usada pelos outros specs
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
  await cached(page);
  await page
    .getByRole("button", { name: /Abrir menu|conta|Admin/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(/\/login/);
  await expect.poll(() => pageKeys(page)).toEqual([]);
  await context.close();
});
