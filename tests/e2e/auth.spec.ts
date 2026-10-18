import { expect, test } from "@playwright/test";
import { axe } from "./session";

// testa o próprio login: sem a sessão do auth.setup.ts
test.use({ storageState: { cookies: [], origins: [] } });

test("rota protegida sem sessão vai para Entrar", async ({ page }) => {
  await page.goto("/config/membros");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await axe(page);
});

test("senha errada mostra o erro", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("ninguem@itcbr.test");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

// usa o admin do seed (npm run db:seed) quando as variáveis existem
test("admin entra e abre Membros", async ({ page }) => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
  await page.goto("/config/membros");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await axe(page);
});
