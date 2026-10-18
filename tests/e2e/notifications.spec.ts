import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

// o PushDevice só troca "Verificando…" pelo estado final no efeito: sinal de que a tela hidratou
const hydrated = (page: Page) =>
  expect(page.getByRole("status").filter({ hasText: /dispositivo|navegador/ })).toBeVisible();

test.describe.configure({ mode: "serial" }); // mexe nas preferências do admin do seed
test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "telas de desktop");
});

test("central de notificações: abas e sem violações de acessibilidade", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Notificações/ }).click();
  await expect(page.getByRole("heading", { name: "Notificações", level: 1 })).toBeVisible();
  for (const tab of ["Todas", "Menções", "Não lidas"]) {
    await page.getByRole("link", { name: tab, exact: true }).click();
    await expect(page.getByRole("link", { name: tab, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test("preferências: canal e horário ficam gravados", async ({ page }) => {
  await login(page);
  await page.goto("/config/preferencias");
  await expect(page.getByRole("heading", { name: "Minhas preferências", level: 1 })).toBeVisible();
  await hydrated(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);

  const box = page.getByRole("checkbox", { name: "E-mail: Comentário em tarefa minha" });
  const was = (await box.getAttribute("aria-checked")) === "true";
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", String(!was));
  await page.waitForTimeout(500); // gravação otimista
  await page.reload();
  await hydrated(page);
  await expect(box).toHaveAttribute("aria-checked", String(!was));
  await box.click(); // volta ao que era
  await expect(box).toHaveAttribute("aria-checked", String(was));

  await page.getByLabel("Início").fill("07:30");
  await page.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByText("Horário salvo")).toBeVisible();
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel("Início")).toHaveValue("07:30");
  await page.getByLabel("Início").fill("08:00");
  await page.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByText("Horário salvo")).toBeVisible();
});
