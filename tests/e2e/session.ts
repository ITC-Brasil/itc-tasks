import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const STORAGE = "test-results/.auth/admin.json";

/** A sessão vem do auth.setup.ts (storageState); só abre a tela inicial já logado. */
export async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}

/**
 * Axe sem transições nem animações: o sonner anima os toasts com as duas, e o axe leria a cor
 * no meio da troca (M-069). Mostra só id e alvo de cada violação.
 */
export async function axe(page: Page, label?: string) {
  const style = await page.addStyleTag({
    content: "*,*::before,*::after{transition:none!important;animation:none!important}",
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  // tira o estilo: sem animação, os diálogos do Base UI não fecham nos passos seguintes do spec
  await style.evaluate((el) => (el as Element).remove());
  expect(
    violations.map((v) => `${page.url()} ${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
    label,
  ).toEqual([]);
}

// troca só o atributo (CSS dos tokens), sem mexer na preferência salva do admin
export async function axeBothThemes(page: Page) {
  await page.locator("main").first().waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await axe(page, theme);
  }
}

/** Criação rápida (atalho C) com um Projeto/Cliente. */
export async function createTask(page: Page, title: string, project: string) {
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: project }).click();
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();
}
