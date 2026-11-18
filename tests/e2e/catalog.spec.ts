import { expect, test } from "@playwright/test";
import { axeBothThemes, axe, createTask, login } from "./session";

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
  await expect(page.getByRole("columnheader", { name: "UM", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Projeto", exact: true })).toBeVisible();
  for (const gone of ["Modelo", "Placa", "Base"]) {
    await expect(page.getByRole("columnheader", { name: gone })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  const dialog = page.getByRole("dialog");
  for (const gone of ["Modelo", "Placa", "Base"]) {
    await expect(dialog.getByLabel(gone)).toHaveCount(0);
  }
  await dialog.getByLabel("UM", { exact: true }).fill(code.toLowerCase());
  await dialog.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Escolha o Projeto/Cliente da Unidade Móvel");
  await dialog.getByLabel("Projeto", { exact: true }).click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Criar Unidade Móvel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: code })).toContainText("Ativo");
});

test("cor por Projeto/Cliente: três cores, chip só com a sigla e UM no tom suave (ADR-068)", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Kanban: desktop");
  test.slow();
  await login(page);
  await page.goto("/config/projetos");
  await page.waitForLoadState("networkidle");
  // três cores da paleta; oliva é o par de menor contraste
  for (const [name, color] of [
    ["QMPR", "Azul"],
    ["BSBIA", "Rosa"],
    ["SEDET", "Oliva"],
  ]) {
    await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .locator("label")
      .filter({ has: page.getByRole("radio", { name: color, exact: true }) })
      .click();
    await expect(dialog.getByRole("radio", { name: color, exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toBeHidden();
  }
  await axeBothThemes(page);

  const title = `E2E cor ${Date.now()}`;
  await createTask(page, title, "QMPR · QMPR");
  await page.goto("/tarefas");
  await page.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "QMPR · QMPR" }).click();
  await page.keyboard.press("Escape");
  await page.waitForURL(/projeto=/);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  const chip = card.locator("span[title='QMPR']").first();
  await expect(chip).toBeVisible();
  // só a sigla aparece; o nome completo fica para o leitor de tela e no tooltip
  await expect(chip.locator(".sr-only")).toHaveText("· QMPR");
  expect(await chip.evaluate((el) => (el as HTMLElement).style.background)).toContain(
    "--project-blue-bg",
  );
  await axeBothThemes(page);
});

test("Envolvidos: cadastro, campo no detalhe e filtro nas visões (ADR-073)", async ({ page }) => {
  test.slow();
  const name = `Contato E2E ${Date.now()}`;
  await login(page);
  await page.goto("/config/envolvidos");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Criar envolvido" }).click();
  const form = page.getByRole("dialog", { name: "Criar envolvido" });
  await form.getByLabel("Nome").fill(name);
  await form.getByRole("button", { name: "Criar envolvido" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await axeBothThemes(page);

  const title = `E2E envolvido ${Date.now()}`;
  await createTask(page, title, "BSBIA · BSBIA");
  const toast = page.getByText(/^TI-\d+ criada$/);
  const number = (await toast.textContent())!.match(/\d+/)![0];
  await page.goto(`/tarefas/${number}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Envolvidos" }).click();
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Envolvidos" })).toContainText(name);

  await page.goto("/tarefas/lista");
  await page.getByRole("combobox", { name: "Envolvido" }).click();
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/envolvido=[0-9a-f-]+/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("paleta com 12 cores: seletor e chip das novas sem violações do axe (ADR-075)", async ({
  page,
}) => {
  test.slow();
  const code = `CR${String(Date.now()).slice(-6)}`;
  await login(page);
  await page.goto("/config/projetos");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Criar Projeto/Cliente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(`Cor ${code}`);
  await dialog.getByLabel("Sigla (2 a 12 letras ou números)").fill(code);
  for (const color of ["Verde-azulado", "Céu", "Terracota", "Mostarda"])
    await expect(dialog.getByRole("radio", { name: color, exact: true })).toBeAttached();
  await dialog
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: "Terracota", exact: true }) })
    .click();
  await axeBothThemes(page); // diálogo com as 12 amostras
  await dialog.getByRole("button", { name: "Criar Projeto/Cliente" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("cell", { name: `Cor ${code}` })).toBeVisible();
  await axeBothThemes(page); // tabela com o chip na cor nova
});
