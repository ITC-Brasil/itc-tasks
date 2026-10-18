import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

async function pickFirst(page: Page, scope: ReturnType<Page["getByRole"]>, label: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option").first().click();
  await page.keyboard.press("Escape"); // fecha o seletor múltiplo
}

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("template de tarefa: criar e usar pela criação rápida", async ({ page }) => {
  const name = `Tpl tarefa ${Date.now()}`;
  await login(page);
  await page.getByRole("link", { name: "Templates" }).click();
  await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Novo template" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByLabel("Título da tarefa").fill(`Preparar {UM} ${name}`);
  await dialog.getByLabel("Prazo (dias úteis após criar)").fill("5");
  await dialog.getByLabel("Subtarefas (uma por linha)").fill("Instalar roteador\nConfigurar VPN");
  await dialog.getByRole("button", { name: "Criar template" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("listitem").getByRole("button", { name }).click();
  const detail = page.getByRole("region", { name });
  await expect(detail).toContainText("Configurar VPN");
  await expect(detail).toContainText("5 dias úteis após criar");
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);

  await detail.getByRole("button", { name: "Usar template" }).click();
  const create = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(create.getByLabel("Título")).toHaveValue(`Preparar {UM} ${name}`);
  await expect(create).toContainText("2 subtarefas do template");
  await expect(create.getByLabel("Prazo")).not.toHaveValue("");
  await pickFirst(page, create, "Projeto/Cliente");
  await create.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByText(/TI-\d+ criada/)).toBeVisible();
  await page.reload();
  await page.getByRole("listitem").getByRole("button", { name }).click();
  await expect(page.getByRole("region", { name })).toContainText("usado 1 vez");
});

test("template de projeto: cria uma tarefa por linha", async ({ page }) => {
  const name = `Tpl projeto ${Date.now()}`;
  await login(page);
  await page.goto("/templates");
  await page.getByRole("button", { name: "Novo template" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Template de projeto" }).click();
  await dialog.getByLabel(/Tarefas \(uma por linha/).fill("Levantar rede\n- Switch\nInstalar UM");
  await dialog.getByRole("button", { name: "Criar template" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("listitem").getByRole("button", { name }).click();
  await page.getByRole("region", { name }).getByRole("button", { name: "Usar template" }).click();
  const use = page.getByRole("dialog", { name: `Usar ${name}` });
  await expect(use).toContainText("Cria 2 tarefas");
  await pickFirst(page, use, "Projeto/Cliente");
  await use.getByRole("button", { name: "Criar tarefas" }).click();
  await expect(page.getByText(/2 tarefas criadas/)).toBeVisible();
  await page.waitForURL("**/tarefas/lista**");
  await expect(page.getByText("Levantar rede").first()).toBeVisible();
});
