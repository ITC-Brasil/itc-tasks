import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// Módulo 10 (ADR-053), E2E adiado para o Módulo 11 (M-061)
test.beforeEach(({ isMobile }) => test.skip(isMobile, "telas de planejamento no desktop"));
test.describe.configure({ timeout: 90_000 });

test("cria um ciclo planejado", async ({ page }) => {
  await login(page);
  await page.goto("/ciclos");
  await page.getByRole("button", { name: "Novo ciclo" }).first().click();
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

test("painel abre em Todos e o filtro de projeto mexe só no ?projeto= (M-139)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/painel?dias=7");
  const filtro = page.getByRole("combobox", { name: "Projeto/Cliente" });
  await expect(filtro).toContainText("Todos os Projetos/Clientes");
  await expect(page.getByText("Abertas por Projeto/Cliente")).toBeVisible();

  await filtro.click();
  await page.getByRole("option").nth(1).click();
  await expect(page).toHaveURL(/projeto=[0-9a-f-]+&dias=7/);
  await expect(page.getByText("Abertas por Projeto/Cliente")).toBeHidden();

  await filtro.click();
  await page.getByRole("option", { name: "Todos os Projetos/Clientes" }).click();
  await expect(page).toHaveURL(/\/painel\?dias=7$/);
  await expect(page.getByText("Abertas por Projeto/Cliente")).toBeVisible();
});

test("encerra o ciclo ativo mesmo sem próximo ciclo (Módulo 16)", async ({ page }) => {
  await login(page);
  await page.goto("/ciclos");
  if (!(await page.getByText("Ativo", { exact: true }).isVisible())) {
    await page.getByRole("button", { name: "Novo ciclo" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Novo ciclo" });
    await dialog.getByLabel("Início").fill("2097-03-02");
    await dialog.getByLabel("Fim").fill("2097-03-13");
    await dialog.getByRole("button", { name: "Criar ciclo" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Iniciar" }).first().click();
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Encerrar ciclo" }).click();
  const dialog = page.getByRole("dialog", { name: /Encerrar Ciclo \d+/ });
  await expect(dialog.getByRole("button", { name: "Encerrar ciclo" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Encerrar ciclo" }).click();
  await expect(page.getByText(/^Ciclo \d+ encerrado/)).toBeVisible();
  await expect(page.getByText("Nenhum ciclo ativo. Inicie um ciclo planejado.")).toBeVisible();
});

test("admin exclui um ciclo planejado com confirmação (ADR-071)", async ({ page }) => {
  await login(page);
  await page.goto("/ciclos");
  await page.getByRole("button", { name: "Novo ciclo" }).first().click();
  const form = page.getByRole("dialog", { name: "Novo ciclo" });
  await form.getByLabel("Início").fill("2096-06-01");
  await form.getByLabel("Fim").fill("2096-06-12");
  await form.getByRole("button", { name: "Criar ciclo" }).click();
  await expect(form).toBeHidden();
  const card = page.getByText("1 de jun – 12 de jun").first().locator("..");
  const trigger = card.getByRole("button", { name: /^Excluir Ciclo \d+$/ });
  await expect(trigger).toBeVisible();
  const name = (await trigger.getAttribute("aria-label"))!.replace("Excluir ", "");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: `Excluir ${name}?` });
  await expect(dialog).toContainText("Nenhuma tarefa está neste ciclo.");
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(`${name} excluído`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Excluir ${name}` })).toHaveCount(0);
});
