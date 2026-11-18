import { expect, test } from "@playwright/test";
import { axeBothThemes, createTask, login } from "./session";

// ADR-078
test.beforeEach(({ isMobile }) => {
  test.skip(!process.env.SEED_ADMIN_EMAIL, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("detalhe: Aguardando pede motivo e previsão; filtro por motivo na Lista", async ({ page }) => {
  const title = `E2E motivo ${Date.now()}`;
  await login(page);
  await page.goto("/tarefas/lista");
  await createTask(page, title, "QMPR · QMPR");
  await page.getByRole("link", { name: title }).first().click();

  const props = page.getByRole("complementary", { name: "Propriedades" });
  await props.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Aguardando" }).click();
  const dialog = page.getByRole("dialog", { name: "Aguardando o quê?" });
  // cancelar não muda o status
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(props.getByRole("combobox", { name: "Status" })).not.toContainText("Aguardando");
  await props.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Aguardando" }).click();
  await dialog.getByRole("combobox", { name: "Motivo" }).click();
  await page.getByRole("option", { name: "Outro" }).click();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog).toBeVisible(); // falta texto e data: o formulário não envia
  await dialog.getByLabel("Descreva").fill("Aprovação da diretoria");
  await dialog.getByLabel("Data prevista").fill("2099-01-15");
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog).toBeHidden();
  await expect(props).toContainText(/Outro · 15 (de )?jan/);
  await expect(props).toContainText("Aprovação da diretoria");
  await axeBothThemes(page);

  await page.goto("/tarefas/lista?motivo=other");
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  await page.goto("/tarefas/lista?motivo=purchase");
  await expect(page.getByRole("row").filter({ hasText: title })).toBeHidden();
});
