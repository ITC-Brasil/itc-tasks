import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home renders without axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ITC Tasks" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

// axe não avalia :active; confere o contraste de on-accent sobre accent-solid-pressed
test("on-accent over accent-solid-pressed meets AA", async ({ page }) => {
  await page.goto("/");
  const ratio = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.trim().slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [
      s.getPropertyValue("--on-accent"),
      s.getPropertyValue("--accent-solid-pressed"),
    ].map(lum);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
