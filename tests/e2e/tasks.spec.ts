import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "criação rápida e detalhe: desktop (mobile no Módulo 11)");
});

test("criação rápida exige Projeto/Cliente e abre o detalhe da tarefa", async ({ page }) => {
  test.slow(); // passa de 30 s com os workers em paralelo
  const title = `E2E tarefa ${Date.now()}`;
  await login(page);

  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c"); // repete até a hidratação ligar o atalho
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(dialog.getByLabel("Título")).toBeFocused();
  await dialog.getByLabel("Título").fill(title);
  await expect(dialog.getByLabel("Projeto/Cliente")).toBeVisible();
  await dialog.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Escolha um Projeto/Cliente para criar a tarefa.",
  );

  // ADR-045: dois Projetos/Clientes e uma UM de cada
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "BSBIA · BSBIA" }).click();
  await page.getByRole("option", { name: "SEDET · SEDET" }).click();
  await page.keyboard.press("Escape"); // fecha só a lista (seleção múltipla)
  await dialog.getByLabel("Unidade Móvel").click();
  await expect(page.getByRole("option", { name: "QDFM01" })).toHaveCount(0);
  await page.getByRole("option", { name: "BSBIA01" }).click();
  await page.getByRole("option", { name: "SPV01" }).click();
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Chamado GLPI").fill("48213");
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();

  const toast = page.getByText(/^TI-\d+ criada$/);
  await expect(toast).toBeVisible();
  const number = (await toast.textContent())!.match(/\d+/)![0];
  await page.getByRole("button", { name: "Abrir" }).click();
  await page.waitForURL(`/tarefas/${number}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: `TI-${number}`, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: title })).toBeVisible();
  for (const chip of ["BSBIA", "SEDET", "BSBIA01", "SPV01"])
    await expect(page.getByTitle(chip, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "#48213" })).toHaveAttribute(
    "href",
    /\/front\/ticket\.form\.php\?id=48213$/,
  );

  await page.getByLabel("Nova subtarefa").fill("Testar link");
  await page.getByLabel("Nova subtarefa").press("Enter");
  // Módulo 15: prazo da subtarefa; vencido aparece marcado e some quando a subtarefa é concluída
  const sub = page.getByRole("listitem").filter({ has: page.getByLabel("Prazo de Testar link") });
  const dueSaved = page.waitForResponse((r) => r.request().method() === "POST");
  await sub.getByLabel("Prazo de Testar link").fill("2020-01-01");
  await dueSaved;
  await expect(sub.getByText("(vencida)")).toBeAttached();
  await page.reload();
  await page.waitForLoadState("networkidle"); // hidratação antes do clique no checkbox
  await expect(sub.getByLabel("Prazo de Testar link")).toHaveValue("2020-01-01");
  await page.getByRole("checkbox", { name: "Testar link" }).click();
  await expect(sub.getByText("(vencida)")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Subtarefas\s*1\/1/ })).toBeVisible();

  await page.getByRole("button", { name: title }).click();
  await page.getByLabel("Título").fill(`${title} editada`);
  // o Next enfileira as actions: espera a do título, não a do checkbox anterior
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().postData()?.includes(" editada"),
  );
  await page.getByLabel("Título").press("Enter");
  await expect(page.getByRole("button", { name: `${title} editada` })).toBeVisible(); // otimista
  await saved;
  await page.reload();
  await expect(page.getByRole("button", { name: `${title} editada` })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Subtarefas\s*1\/1/ })).toBeVisible();

  await axeBothThemes(page);
});

test("criação rápida com descrição; Criar outra limpa a descrição", async ({ page }) => {
  test.slow();
  const title = `E2E descrição ${Date.now()}`;
  await login(page);

  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(dialog.getByLabel("Título")).toBeFocused(); // M-086: o foco continua no título
  await expect(dialog.getByLabel("Descrição")).toHaveCount(0); // fechada por padrão
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "BSBIA · BSBIA" }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("checkbox", { name: "Criar outra" }).click();

  await dialog.getByRole("button", { name: "+ Adicionar descrição" }).click();
  const description = dialog.getByLabel("Descrição");
  await expect(description).toBeFocused();
  await description.pressSequentially("Trocar o switch do rack");
  await axeBothThemes(page); // campo aberto, nos dois temas
  await description.press("Control+Enter"); // cria com o foco dentro da descrição

  const toast = page.getByText(/^TI-\d+ criada$/);
  await expect(toast).toBeVisible();
  const number = (await toast.textContent())!.match(/\d+/)![0];
  // "Criar outra": título e descrição limpos, Projeto/Cliente mantido
  await expect(dialog.getByLabel("Título")).toHaveValue("");
  await expect(dialog.getByLabel("Descrição")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "+ Adicionar descrição" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Projeto/Cliente" })).toContainText(
    "BSBIA · BSBIA",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.goto(`/tarefas/${number}`);
  await expect(page.getByRole("textbox", { name: "Descrição" })).toHaveText(
    "Trocar o switch do rack",
  );
});

test("tarefa inexistente mostra a página de não encontrado", async ({ page }) => {
  await login(page);
  await page.goto("/tarefas/999999999");
  await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
});
