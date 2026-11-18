import { expect, test } from "@playwright/test";
import { axeBothThemes, createTask, login } from "./session";

// ADR-079
test.beforeEach(({ isMobile }) => {
  test.skip(!process.env.SEED_ADMIN_EMAIL, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("bloqueada por: busca, selo no card, filtro e confirmação ao concluir", async ({ page }) => {
  const stamp = Date.now();
  const [blocker, blocked] = [`E2E bloqueadora ${stamp}`, `E2E bloqueada ${stamp}`];
  await login(page);
  await page.goto("/tarefas/lista");
  await createTask(page, blocker, "QMPR · QMPR");
  await createTask(page, blocked, "QMPR · QMPR");
  await page.getByRole("link", { name: blocked }).first().click();

  const deps = page.getByRole("region", { name: "Dependências" });
  await deps.getByLabel("Buscar tarefa").fill(blocker);
  await deps.getByRole("button", { name: new RegExp(blocker) }).click();
  await expect(deps).toContainText("1 bloqueadora aberta");
  await expect(deps.getByRole("link", { name: new RegExp(blocker) })).toBeVisible();
  await axeBothThemes(page);

  // concluir pede confirmação; cancelar não muda
  const props = page.getByRole("complementary", { name: "Propriedades" });
  await props.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Concluído" }).click();
  const confirm = page.getByRole("dialog", { name: "Concluir com bloqueadora aberta?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toBeHidden();

  await page.goto("/tarefas/lista?bloqueada=1");
  await expect(page.getByRole("row").filter({ hasText: blocked })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: blocker })).toBeHidden();
  await page.goto("/tarefas?bloqueada=1");
  await expect(
    page.getByRole("listitem").filter({ hasText: blocked }).getByRole("img", { name: "Bloqueada" }),
  ).toBeVisible();
});
