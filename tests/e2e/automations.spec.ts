import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" }); // liga e desliga regras do seed
test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("automações: regras do seed, liga/desliga e sem violações de acessibilidade", async ({
  page,
}) => {
  await login(page);
  await page.goto("/config/automacoes");
  await expect(page.getByRole("heading", { name: "Automações", level: 1 })).toBeVisible();
  await expect(page.getByText("Lembrar de atualizar o GLPI")).toBeVisible();
  await expect(page.getByText("Comentar: “Atualize o chamado #{GLPI}”")).toBeVisible();

  const toggle = page.getByRole("switch", { name: "Ativar Etiquetar tarefas de UM" });
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("aria-checked", before!);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", before!);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test("automações: criar regra com duas ações", async ({ page }) => {
  const name = `E2E ${Date.now()}`;
  await login(page);
  await page.goto("/config/automacoes");
  await page.getByRole("button", { name: "Nova automação" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByRole("button", { name: "Adicionar ação" }).click();
  await dialog.getByRole("combobox", { name: "Tipo da ação 2" }).click();
  await page.getByRole("option", { name: "Comentar" }).click();
  await dialog.getByLabel("Texto do comentário da ação 2").fill("Feito na {ID}");
  await dialog.getByRole("button", { name: "Criar automação" }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("Notificar o responsável e Comentar: “Feito na {ID}”");
  // desliga para não agir nas tarefas do dev
  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "false");
});
