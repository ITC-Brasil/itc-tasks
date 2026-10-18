import { expect, test } from "@playwright/test";
import { axe, login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de cadastro: desktop");
});

test("as quatro telas de cadastro abrem sem violações do axe", async ({ page }) => {
  // M-029: o "axe intermitente" era o limite de 30 s (4 telas + axe com workers em paralelo)
  test.slow();
  await login(page);
  for (const [path, title] of [
    ["/config/projetos", "Projetos/Clientes"],
    ["/config/unidades", "Unidades Móveis"],
    ["/config/workflow", "Workflow"],
    ["/config/etiquetas", "Etiquetas"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await axe(page, path);
  }
});

test("cria Projeto/Cliente, recusa sigla repetida e arquiva", async ({ page }) => {
  // sigla de 4 letras derivada do relógio: não repete entre execuções próximas
  const code = Array.from(Date.now().toString(26).slice(-4), (c) =>
    String.fromCharCode(65 + (parseInt(c, 26) % 26)),
  ).join("");
  const name = `E2E ${code}`;
  await login(page);
  await page.goto("/config/projetos");
  await page.waitForLoadState("networkidle");

  const create = async () => {
    await page.getByRole("button", { name: "Criar Projeto/Cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill(name);
    await dialog.getByLabel("Sigla (2 a 12 letras ou números)").fill(code.toLowerCase());
    await dialog.getByRole("button", { name: "Criar Projeto/Cliente" }).click();
    return dialog;
  };

  await create();
  await expect(page.getByRole("dialog")).toBeHidden();
  const row = page.getByRole("row", { name });
  await expect(row).toContainText(code); // sigla gravada em maiúsculas

  const dialog = await create();
  await expect(dialog.getByRole("alert")).toHaveText(
    `Já existe um Projeto/Cliente com a sigla ${code}`,
  );
  await page.keyboard.press("Escape");

  await row.getByRole("button", { name: `Arquivar ${name}` }).click();
  await expect(row).toContainText("Arquivado");
  await row.getByRole("button", { name: `Reativar ${name}` }).click();
  await expect(row).toContainText("Ativo");
});

test("cria Unidade Móvel com Projeto/Cliente", async ({ page }) => {
  const code = `UM-E2E-${Date.now().toString(36).slice(-5)}`.toUpperCase();
  await login(page);
  await page.goto("/config/unidades");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill(code.toLowerCase());
  await dialog.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Escolha o Projeto/Cliente da Unidade Móvel");
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: code })).toContainText("Ativo");
});
