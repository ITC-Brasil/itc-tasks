import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Módulo 11 (ADR-054): PWA, telas mobile e axe nos dois temas
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

// troca só o atributo (CSS dos tokens), sem mexer na preferência salva do admin
async function axeBothThemes(page: Page) {
  await page.locator("main").first().waitFor();
  // sem transição: o axe leria a cor no meio da troca
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.map(
        (v) => `${page.url()} ${theme} ${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`,
      ),
    ).toEqual([]);
  }
}

test.beforeEach(() => test.skip(!email || !password, "SEED_ADMIN_* não definidos"));
test.describe.configure({ timeout: 60_000 });

test("manifest e service worker", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/?criar=1", "/"]);
  await login(page);
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/"))))
    .toBe(true);
});

test("sem rede: faixa e escrita desabilitada", async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão — mostrando a última versão salva/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar tarefa" }).first()).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText(/Sem conexão/)).toBeHidden();
});

test("/?criar=1 abre a criação rápida", async ({ page }) => {
  await login(page);
  await page.goto("/?criar=1");
  await expect(page.getByRole("dialog", { name: "Criar tarefa" })).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("mobile: barra inferior, Mais e criação em painel inferior", async ({ page, isMobile }) => {
  test.skip(!isMobile, "só no mobile");
  await login(page);
  const bar = page.getByRole("navigation", { name: "Navegação", exact: true });
  for (const name of ["Minhas", "Tarefas", "Criar", "Ciclo", "Mais"])
    await expect(bar.getByText(name, { exact: true })).toBeVisible();

  await bar.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("menuitem", { name: "Painel" })).toBeVisible();
  await page.keyboard.press("Escape");

  await bar.getByRole("button", { name: "Criar" }).click();
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(dialog).toBeVisible();
  // painel inferior: encosta no fim da tela (espera a animação de abertura)
  const bottom = async () => {
    const box = (await dialog.boundingBox())!;
    return Math.round(box.y + box.height);
  };
  await expect.poll(bottom).toBe(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
});

test("mobile: Kanban uma coluna por vez", async ({ page, isMobile }) => {
  test.skip(!isMobile, "só no mobile");
  await login(page);
  await page.goto("/tarefas");
  const column = page.locator("section[aria-label]").first();
  await expect(column).toBeVisible();
  const width = (await column.boundingBox())!.width;
  expect(width).toBeGreaterThan(page.viewportSize()!.width - 40);
});

test("axe nos dois temas: Minhas, Kanban, Lista, Detalhe, Criação rápida e Configurações", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page);
  await axeBothThemes(page);

  await page.goto("/tarefas");
  await axeBothThemes(page);

  await page.goto("/tarefas/lista");
  await axeBothThemes(page);

  const first = page
    .locator('a[href^="/tarefas/"]')
    .filter({ hasText: /TI-\d+/ })
    .first();
  if (await first.count()) {
    await page.goto((await first.getAttribute("href"))!);
    await axeBothThemes(page);
  }

  await page.goto("/?criar=1");
  await expect(page.getByRole("dialog", { name: "Criar tarefa" })).toBeVisible();
  await axeBothThemes(page);

  await page.goto("/config/projetos");
  await axeBothThemes(page);
});
