import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home renders without axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ITC Tasks" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});
