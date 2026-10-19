import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// M-087: edição do nome. Não renomeia o admin do seed: o shell.spec procura "Administrador"
test.beforeEach(({ isMobile }) => {
  test.skip(!process.env.SEED_ADMIN_EMAIL, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de configuração: desktop");
});

test("admin edita o nome de um membro em Membros", async ({ page }) => {
  test.slow();
  const run = Date.now();
  await login(page);
  await page.goto("/config/membros");

  await page.getByRole("button", { name: "Criar membro" }).click();
  const create = page.getByRole("dialog", { name: "Criar membro" });
  await create.getByLabel("Nome").fill(`Pessoa ${run}`);
  await create.getByLabel("E-mail").fill(`pessoa-${run}@t.test`);
  await create.getByLabel("Senha inicial").fill("senha-de-teste-123");
  await create.getByRole("button", { name: "Criar membro" }).click();
  await expect(create).toBeHidden();

  await page.getByRole("button", { name: `Editar nome de Pessoa ${run}` }).click();
  const rename = page.getByRole("dialog", { name: `Editar nome de Pessoa ${run}` });
  // axe antes do erro: o text-err no escuro fica abaixo de 4,5:1 em todos os diálogos (M-088)
  await axeBothThemes(page);
  await rename.getByLabel("Nome").fill("   ");
  await rename.getByRole("button", { name: "Salvar nome" }).click();
  await expect(rename.getByRole("alert")).toHaveText("Informe o nome");
  await rename.getByLabel("Nome").fill(`Renomeada ${run}`);
  await rename.getByRole("button", { name: "Salvar nome" }).click();
  await expect(rename).toBeHidden();
  await expect(page.getByRole("cell", { name: `Renomeada ${run}`, exact: true })).toBeVisible();
});

test("Minhas preferências: campo Nome recusa vazio e salva", async ({ page }) => {
  await login(page);
  await page.goto("/config/preferencias");
  const name = page.getByLabel("Nome", { exact: true });
  const current = await name.inputValue();
  expect(current.trim()).not.toBe("");

  await axeBothThemes(page);
  await name.fill("   ");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("Informe o nome")).toBeVisible();
  await name.fill(current);
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("Nome alterado")).toBeVisible();
  await expect(page.getByText("Informe o nome")).toHaveCount(0);
});
