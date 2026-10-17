import { expect, test } from "@playwright/test";

// axe não avalia :active; confere o contraste de on-accent sobre accent-solid-pressed
test("on-accent over accent-solid-pressed meets AA", async ({ page }) => {
  await page.goto("/login");
  const ratio = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--on-accent)";
    probe.style.backgroundColor = "var(--accent-solid-pressed)";
    document.body.append(probe);
    const { color, backgroundColor } = getComputedStyle(probe);
    const lum = (rgb: string) => {
      const [r, g, b] = rgb
        .match(/\d+/g)!
        .slice(0, 3)
        .map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(color), lum(backgroundColor)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
