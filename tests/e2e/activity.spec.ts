import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

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
  // sob carga, o Ctrl+Enter saía antes de o projeto entrar no campo e a criação era recusada (M-069)
  await expect(dialog.getByLabel("Projeto/Cliente")).toContainText("BSBIA");
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
  await expect(page.locator("section[aria-labelledby=comments] .mention")).toBeVisible();

  // Módulo 16: Atividade separada dos comentários, recolhida por padrão, com a contagem
  const toggle = page.getByRole("button", { name: /^Atividade · \d+$/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("criou a tarefa")).toBeHidden();
  await axeBothThemes(page); // recolhida
  await toggle.focus();
  await page.keyboard.press("Enter"); // abre pelo teclado
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("criou a tarefa")).toBeVisible();
  await expect(page.locator("section[aria-labelledby=activity] .mention")).toHaveCount(0);
  await axeBothThemes(page); // aberta

  await page.goto("/?aba=mencoes");
  await expect(page.getByText(title)).toBeVisible();
});
