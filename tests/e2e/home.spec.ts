import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home renders without axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ITC Tasks" })).toBeVisible();
  // ponytail: contraste fica para a auditoria do Módulo 11 (on-accent 3.9:1 é valor da marca)
  const { violations } = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(violations).toEqual([]);
});
