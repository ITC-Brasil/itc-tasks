import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const STORAGE = "test-results/.auth/admin.json";

/** A sessão vem do auth.setup.ts (storageState); só abre a tela inicial já logado. */
export async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}

// troca só o atributo (CSS dos tokens), sem mexer na preferência salva do admin
export async function axeBothThemes(page: Page) {
  await page.locator("main").first().waitFor();
  // sem transição: o axe leria a cor no meio da troca
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.map(
        (v) => `${page.url()} ${theme} ${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`,
      ),
    ).toEqual([]);
  }
}
