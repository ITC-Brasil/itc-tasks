import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// Módulo 18, item 14: no celular, "i" com a explicação e abas numa linha com rolagem
test.beforeEach(({ isMobile }) => test.skip(!isMobile, "só no celular"));

test("abas deslizantes e o “i” da aba ativa", async ({ page }) => {
  await login(page);
  await page.goto("/?aba=mencoes");
  const tabs = page.getByRole("navigation", { name: "Abas" });
  const box = await tabs.evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth,
    h: el.clientHeight,
  }));
  expect(box.sw).toBeGreaterThan(box.cw); // uma linha só, rolando
  expect(box.h).toBeLessThan(60);
  await expect(tabs.getByRole("link", { name: "Menções" })).toBeInViewport();
  await page.getByRole("button", { name: "Sobre esta aba" }).click();
  await expect(
    page.getByText("Tarefas em que alguém mencionou você nos comentários."),
  ).toBeVisible();
  await axeBothThemes(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Tarefas em que alguém mencionou você nos comentários."),
  ).toBeHidden();
});
