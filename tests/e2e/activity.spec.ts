import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "detalhe: desktop (mobile no Módulo 11)");
});

test("busca ⌘K abre a tarefa; comentário com @menção vai para a aba Menções", async ({ page }) => {
  test.slow();
  const title = `E2E atividade ${Date.now()}`;
  await login(page);

  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "BSBIA · BSBIA" }).click(); // QMPR é do views.spec, que roda em paralelo
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();

  // ⌘K: busca sem acento e abre o detalhe
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Busca e comandos" });
  await palette.getByRole("combobox").fill(title.replace("E2E ", ""));
  await palette.getByRole("option", { name: new RegExp(title) }).click();
  await page.waitForURL(/\/tarefas\/\d+$/);
  // primeira compilação do detalhe no next dev passa de 5 s com os workers em paralelo
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });

  // comentário com menção
  const editor = page.getByRole("textbox", { name: "Comentário" });
  await editor.click();
  await page.keyboard.type("Olhar com @Admin");
  await page.getByRole("option", { name: /Admin/ }).first().click();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("criou a tarefa")).toBeVisible();
  await expect(page.locator("section[aria-labelledby=activity] .mention")).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations, theme).toEqual([]);
  }

  await page.goto("/?aba=mencoes");
  await expect(page.getByText(title)).toBeVisible();
});
