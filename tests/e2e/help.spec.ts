import { expect, type Page, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// ADR-065: /ajuda para qualquer papel logado, com âncoras estáveis
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(() => test.skip(!email || !password, "SEED_ADMIN_* não definidos"));

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const inView = (page: Page, id: string) =>
  page.evaluate((i) => {
    const r = document.getElementById(i)!.getBoundingClientRect();
    return r.top >= -1 && r.top < window.innerHeight;
  }, id);

test("abre pelo menu do usuário e pelo ⌘K; axe nos dois temas", async ({ page, isMobile }) => {
  await login(page);
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Navegação" })
      .getByRole("button", { name: "Mais" })
      .click();
  else
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button")
      .last()
      .click();
  await page.getByRole("menuitem", { name: "Ajuda" }).click();
  await expect(page).toHaveURL(/\/ajuda$/);
  await expect(page.getByRole("heading", { name: "Ajuda", level: 1 })).toBeVisible();
  await axeBothThemes(page);

  await login(page);
  const palette = page.getByRole("dialog", { name: "Busca e comandos" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  await palette.getByRole("combobox").fill("ajuda");
  await palette.getByRole("option", { name: "Abrir ajuda" }).click();
  await expect(page).toHaveURL(/\/ajuda$/);
});

test("âncoras #mcp e #mcp-hermes rolam até a seção", async ({ page }) => {
  await page.goto("/ajuda#mcp");
  await expect.poll(() => inView(page, "mcp")).toBe(true);
  await page.goto("/ajuda#mcp-hermes");
  await expect.poll(() => inView(page, "mcp-hermes")).toBe(true);
  await expect(page.locator("#mcp-hermes")).toContainText("mcp_servers");
});

test("Agentes e MCP leva a /ajuda#mcp", async ({ page, isMobile }) => {
  test.skip(isMobile, "tela de configuração: desktop");
  await page.goto("/config/agentes");
  await page.getByRole("link", { name: "Como conectar um agente" }).click();
  await expect(page).toHaveURL(/\/ajuda#mcp$/);
});

test("Copiar mostra o toast", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "permissão de área de transferência");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/ajuda#mcp-claude-code");
  await page.getByRole("button", { name: "Copiar configuração do Claude Code" }).click();
  await expect(page.getByText("Copiado")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "claude mcp add --transport http",
  );
});

test("sem rolagem horizontal em 390 e 1280 px", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ajuda");
    await page.locator("#papeis").waitFor();
    expect(await noHorizontalScroll(page), `${width}px`).toBe(true);
  }
});

test("membro também acessa", async ({ page, browser, baseURL, isMobile }) => {
  test.skip(isMobile, "um login a mais basta");
  test.slow();
  const run = Date.now();
  const member = `ajuda-${run}@t.test`;
  await page.goto("/config/membros");
  await page.getByRole("button", { name: "Criar membro" }).click();
  const create = page.getByRole("dialog", { name: "Criar membro" });
  await create.getByLabel("Nome").fill(`Ajuda ${run}`);
  await create.getByLabel("E-mail").fill(member);
  await create.getByLabel("Senha inicial").fill("senha-de-teste-123");
  await create.getByRole("button", { name: "Criar membro" }).click();
  await expect(create).toBeHidden();

  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const mp = await ctx.newPage();
  await mp.goto("/login");
  await mp.getByLabel("E-mail").fill(member);
  await mp.getByLabel("Senha").fill("senha-de-teste-123");
  await mp.getByRole("button", { name: "Entrar" }).click();
  await mp.waitForURL("/");
  await mp.goto("/ajuda");
  await expect(mp.getByRole("heading", { name: "Ajuda", level: 1 })).toBeVisible();
  await expect(mp.locator("#mcp")).toBeVisible();
  await ctx.close();
});
