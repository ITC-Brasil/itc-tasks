import { expect, test } from "@playwright/test";
import { axeBothThemes, createTask, login } from "./session";

// ADR-077
test.beforeEach(({ isMobile }) => {
  test.skip(!process.env.SEED_ADMIN_EMAIL, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("repetir uma tarefa: regra preenchida, pausar, retomar e excluir", async ({ page }) => {
  const title = `Rotina ${Date.now()}`;
  await login(page);
  await page.goto("/tarefas/lista");
  await createTask(page, title, "QMPR · QMPR");
  await page.getByRole("link", { name: title }).first().click();
  await page.getByRole("link", { name: "Repetir esta tarefa" }).click();

  const dialog = page.getByRole("dialog", { name: "Nova recorrência" });
  await expect(dialog.getByLabel("Título")).toHaveValue(title);
  await expect(dialog.getByLabel("Nome da regra")).toHaveValue(title);
  await dialog.getByRole("combobox", { name: "Frequência" }).click();
  await page.getByRole("option", { name: "Mensal / a cada N meses" }).click();
  await dialog.getByLabel("A cada quantos meses").fill("3");
  await dialog.getByLabel("Vence em (dias)").fill("2");
  await dialog.getByRole("button", { name: "Criar recorrência" }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole("listitem", { name: title });
  await expect(card).toContainText("A cada 3 meses, dia 1");
  await expect(card).toContainText("vence em 2 dias");
  await axeBothThemes(page);

  await card.getByRole("button", { name: "Pausar" }).click();
  await expect(card).toContainText("Pausada");
  await card.getByRole("button", { name: "Retomar" }).click();
  await expect(card).not.toContainText("Pausada");

  await card.getByRole("button", { name: `Excluir ${title}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(card).toBeHidden();
});
