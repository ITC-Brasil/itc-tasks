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

  // M-122: as ações ficam no menu da linha
  // axe com o menu aberto acusa "region": o portal do Base UI fica fora dos landmarks
  await axeBothThemes(page);
  await page.getByRole("button", { name: `Ações de Pessoa ${run}` }).click();
  await page.getByRole("menuitem", { name: "Editar nome" }).click();
  const rename = page.getByRole("dialog", { name: `Editar nome de Pessoa ${run}` });
  await axeBothThemes(page);
  await rename.getByLabel("Nome").fill("   ");
  await rename.getByRole("button", { name: "Salvar nome" }).click();
  await expect(rename.getByRole("alert")).toHaveText("Informe o nome");
  await axeBothThemes(page); // ADR-057: com a mensagem de erro visível
  await rename.getByLabel("Nome").fill(`Renomeada ${run}`);
  await rename.getByRole("button", { name: "Salvar nome" }).click();
  await expect(rename).toBeHidden();
  await expect(page.getByRole("cell", { name: `Renomeada ${run}`, exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Ações de Renomeada ${run}` }).click();
  await page.getByRole("menuitem", { name: "Redefinir senha" }).click();
  const reset = page.getByRole("dialog", { name: `Redefinir senha de Renomeada ${run}` });
  await reset.getByLabel("Senha nova").fill("outra-senha-teste-123");
  await reset.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(reset).toBeHidden();

  await page.getByRole("button", { name: `Ações de Renomeada ${run}` }).click();
  await page.getByRole("menuitem", { name: "Desativar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Renomeada ${run}`) })).toContainText(
    "Desativado",
  );
  await page.getByRole("button", { name: `Ações de Renomeada ${run}` }).click();
  await page.getByRole("menuitem", { name: "Reativar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Renomeada ${run}`) })).toContainText(
    "Ativo",
  );
});

test("Membros: sem rolagem horizontal em 1280 px; (você) troca a senha nas preferências", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.goto("/config/membros");
  const region = page.getByRole("region", { name: "Membros" });
  await expect(region).toBeVisible();
  const { scrollWidth, clientWidth } = await region.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  const selfRow = page.getByRole("row", { name: /\(você\)/ });
  await selfRow.getByRole("button", { name: /^Ações de / }).click();
  await expect(page.getByRole("menuitem", { name: "Redefinir senha" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Desativar" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Trocar senha" }).click();
  await expect(page).toHaveURL(/\/config\/preferencias#h-password$/);
  await expect(page.getByRole("heading", { name: "Senha" })).toBeVisible();
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
  await axeBothThemes(page); // ADR-057: com a mensagem de erro visível
  await name.fill(current);
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("Nome alterado")).toBeVisible();

  // M-117: senha atual errada mostra o erro e não troca nada
  await page.getByLabel("Senha atual", { exact: true }).fill("nao-e-a-senha-123");
  await page.getByLabel("Nova senha", { exact: true }).fill("nova-senha-forte-1");
  await page.getByLabel("Confirme a nova senha").fill("nova-senha-forte-1");
  await page.getByRole("button", { name: "Trocar senha" }).click();
  await expect(page.getByText("Senha atual incorreta")).toBeVisible();
  await axeBothThemes(page);
  await expect(page.getByText("Informe o nome")).toHaveCount(0);
});
