import { expect, test } from "@playwright/test";
import { axeBothThemes, createTask, login } from "./session";

// M-117 item 2 / ADR-063: exclusão definitiva no detalhe e na Lista
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "detalhe e Lista: desktop");
});

test("exclui no detalhe: confirma com TI-n e título, volta à Lista e a rota dá 404", async ({
  page,
}) => {
  test.slow();
  const title = `E2E excluir ${Date.now()}`;
  await login(page);
  await createTask(page, title, "QMPR · QMPR");
  const toast = page.getByText(/^TI-\d+ criada$/);
  const number = (await toast.textContent())!.match(/\d+/)![0];
  await page.goto(`/tarefas/${number}`);

  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir tarefa?" });
  await expect(dialog).toContainText(`TI-${number}`);
  await expect(dialog).toContainText(title);
  await axeBothThemes(page);
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await page.waitForURL("/tarefas/lista");
  await expect(page.getByText(`TI-${number} excluída`)).toBeVisible();

  // o Suspense já enviou 200 quando o notFound() roda: confere a tela do 404
  await page.goto(`/tarefas/${number}`);
  await expect(page.getByText("Página não encontrada")).toBeVisible();
});

test("exclui em massa na Lista", async ({ page }) => {
  test.slow();
  const run = Date.now();
  await login(page);
  // a criação rápida lembra o último Projeto/Cliente: outro projeto para não desmarcar
  await createTask(page, `E2E massa ${run} 1`, "QMPR · QMPR");
  await createTask(page, `E2E massa ${run} 2`, "BSBIA · BSBIA");

  await page.goto("/tarefas/lista");
  const rows = page.getByRole("row").filter({ hasText: `E2E massa ${run}` });
  await expect(rows).toHaveCount(2);
  for (let i = 0; i < 2; i++) await rows.nth(i).getByRole("checkbox").check();
  await page
    .getByRole("toolbar", { name: "Ações em massa" })
    .getByRole("button", { name: "Excluir" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Excluir 2 tarefas?" });
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("2 tarefas excluídas")).toBeVisible();
  await expect(rows).toHaveCount(0);
});
