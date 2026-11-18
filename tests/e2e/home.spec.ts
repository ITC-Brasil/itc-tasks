import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// Módulo 16, item 8: "Minhas tarefas" virou "Início", com a aba Hoje como padrão
test.beforeEach(({ isMobile }) => test.skip(isMobile, "Início: desktop"));

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function personal(page: import("@playwright/test").Page, title: string, due: string) {
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByRole("checkbox", { name: "Tarefa pessoal" }).click();
  await dialog.getByLabel("Prazo").fill(due);
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();
}

test("Início: nome, aba Hoje com Atrasadas e Hoje, subtarefa e atalhos", async ({ page }) => {
  test.slow();
  const run = Date.now();
  await login(page);
  await expect(page).toHaveTitle("Início · ITC Tasks");
  await expect(page.getByRole("heading", { name: "Início", level: 1 })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Abas" }).getByRole("link");
  await expect(tabs).toHaveText([
    "Hoje",
    "Minhas tarefas",
    "Pessoais",
    "Atribuídas",
    "Criadas",
    "Menções",
  ]);
  await expect(tabs.first()).toHaveAttribute("aria-current", "page");

  await personal(page, `E2E hoje ${run}`, today());
  await personal(page, `E2E atrasada ${run}`, "2020-03-02");
  await personal(page, `E2E depois ${run}`, "2099-03-02");
  // subtarefa vencida numa tarefa sem prazo próprio de hoje
  const toast = page.getByText(/^TI-\d+ criada$/).last();
  const number = (await toast.textContent())!.match(/\d+/)![0];
  await page.goto(`/tarefas/${number}`);
  await page.getByLabel("Nova subtarefa").fill(`Sub ${run}`);
  await page.getByLabel("Nova subtarefa").press("Enter");
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByLabel(`Prazo de Sub ${run}`).fill("2020-03-02");
  await saved;

  await page.goto("/");
  await expect(page.getByRole("link", { name: `E2E hoje ${run}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `E2E atrasada ${run}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `E2E depois ${run}` })).toHaveCount(0);
  const sub = page.getByRole("listitem").filter({ hasText: `Sub ${run}` });
  await expect(sub.getByText("Subtarefa")).toBeVisible();
  await expect(sub.getByRole("link", { name: `TI-${number}` })).toBeVisible();
  await axeBothThemes(page);

  // Minhas tarefas continua com tudo o que é da pessoa
  await page.goto("/?aba=minhas");
  await expect(page.getByRole("link", { name: `E2E depois ${run}` })).toBeVisible();

  // G I e G M levam ao Início
  await page.goto("/tarefas");
  await expect(async () => {
    await page.keyboard.press("g");
    await page.keyboard.press("i");
    await expect(page).toHaveURL(/\/$/, { timeout: 1000 });
  }).toPass();
});
