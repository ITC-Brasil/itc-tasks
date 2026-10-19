import { expect, type Page, test } from "@playwright/test";
import { login } from "./session";

// UI.md §5: sequências G + tecla e, dentro de Tarefas, V + tecla com os filtros da URL
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "atalhos de teclado: desktop");
});

// repete até o atalho pegar: logo depois da navegação o shell ainda pode estar hidratando
async function press(page: Page, keys: string[], url: RegExp) {
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const k of keys) await page.keyboard.press(k);
    await expect(page).toHaveURL(url, { timeout: 1000 });
  }).toPass();
}

test("G M, G T, G N e G C levam às telas", async ({ page }) => {
  await login(page);
  await press(page, ["g", "t"], /\/tarefas$/);
  await press(page, ["g", "n"], /\/notificacoes$/);
  await press(page, ["g", "c"], /\/ciclos$/);
  await press(page, ["g", "m"], /\/$/);
});

test("V L, V C e V K trocam a visão e mantêm os filtros", async ({ page }) => {
  await page.goto("/tarefas?prioridade=high");
  await press(page, ["v", "l"], /\/tarefas\/lista\?prioridade=high$/);
  await press(page, ["v", "c"], /\/tarefas\/calendario\?prioridade=high$/);
  await press(page, ["v", "k"], /\/tarefas\?prioridade=high$/);
});

test("não dispara com o foco num campo", async ({ page }) => {
  await page.goto("/tarefas/lista");
  await page.waitForLoadState("networkidle");
  const palette = page.getByRole("dialog", { name: "Busca e comandos" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  const input = palette.getByRole("combobox");
  await input.press("g");
  await input.press("t");
  await input.press("v");
  await input.press("k");
  await expect(input).toHaveValue("gtvk");
  await expect(page).toHaveURL(/\/tarefas\/lista$/);
});
