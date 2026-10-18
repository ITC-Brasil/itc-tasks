import { test as setup } from "@playwright/test";
import { STORAGE } from "./session";

// entra uma vez por execução: o Better Auth limita o login (3 a cada 10 s em produção)
setup("entrar como admin do seed", async ({ page }) => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("/");
  }
  await page.context().storageState({ path: STORAGE });
});
