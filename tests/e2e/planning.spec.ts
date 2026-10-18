import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// Módulo 10 (ADR-053), E2E adiado para o Módulo 11 (M-061)
test.beforeEach(({ isMobile }) => test.skip(isMobile, "telas de planejamento no desktop"));
test.describe.configure({ timeout: 90_000 });

test("cria um ciclo planejado", async ({ page }) => {
  await login(page);
  await page.goto("/ciclos");
  await page.getByRole("button", { name: "Novo ciclo" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo ciclo" });
  await dialog.getByLabel("Início").fill("2099-01-05");
  await dialog.getByLabel("Fim").fill("2099-01-16");
  await dialog.getByRole("button", { name: "Criar ciclo" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/5 de jan – 16 de jan/).first()).toBeVisible();
});

test("Ciclos, Marcos e Painel sem violações do axe nos dois temas", async ({ page }) => {
  await login(page);
  for (const path of ["/ciclos", "/marcos", "/painel"]) {
    await page.goto(path);
    await axeBothThemes(page);
  }
});
