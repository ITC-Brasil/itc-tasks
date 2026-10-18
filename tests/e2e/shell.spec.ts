import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

// espera a server action gravar a preferência antes de recarregar ou sair
async function press(page: Page, key: string) {
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.keyboard.press(key);
  await saved;
}

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

test.beforeEach(() => test.skip(!email || !password, "SEED_ADMIN_* não definidos"));
// os dois testes mudam preferências do mesmo admin: em série
test.describe.configure({ mode: "serial" });

test("desktop: [ recolhe a sidebar e a escolha sobrevive ao recarregar", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sidebar só a partir de 768 px");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const width = async () => (await nav.boundingBox())!.width;
  const start = await width();

  await press(page, "[");
  await expect.poll(width).not.toBe(start);
  await page.reload();
  await page.waitForLoadState("networkidle"); // hidratado: o atalho já responde
  await expect.poll(width).not.toBe(start);

  await press(page, "[");
  await expect.poll(width).toBe(start);

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Atalhos de teclado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await axe(page);
});

test("tema claro e escuro pelo menu da conta, sem violações do axe", async ({ page, isMobile }) => {
  test.skip(isMobile, "preferência compartilhada com o teste desktop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const html = page.locator("html");
  const account = page.getByRole("button", { name: /Administrador/ });

  // alterna duas vezes (vale para qualquer tema inicial) e roda o axe nos dois
  for (let i = 0; i < 2; i++) {
    const before = await html.getAttribute("data-theme");
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await account.click();
    await page.getByRole("menuitem", { name: /Usar tema/ }).click();
    await expect(html).not.toHaveAttribute("data-theme", before!);
    await saved;
    // o menu ainda some animado: o axe leria o texto dele semitransparente
    await expect(page.getByRole("menu")).toBeHidden();
    await axe(page);
  }
});

test("mobile: barra inferior no lugar da sidebar", async ({ page, isMobile }) => {
  test.skip(!isMobile, "só no mobile");
  await login(page);
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Navegação", exact: true })).toBeVisible();
  await axe(page);
});

test("falha ao salvar a preferência desfaz a mudança e avisa", async ({ page, isMobile }) => {
  test.skip(isMobile, "sidebar só a partir de 768 px");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.waitForLoadState("networkidle");
  // toda server action responde 500 a partir daqui
  await page.route("**/*", (route) =>
    route.request().headers()["next-action"]
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const width = async () => (await nav.boundingBox())!.width;
  const start = await width();
  const html = page.locator("html");
  const theme = await html.getAttribute("data-theme");
  const toast = page.getByText("Não foi possível salvar a preferência").first();

  await page.keyboard.press("[");
  await expect(toast).toBeVisible();
  await expect.poll(width).toBe(start);

  await page.getByRole("button", { name: /Administrador/ }).click();
  await page.getByRole("menuitem", { name: /Usar tema/ }).click();
  await expect(html).toHaveAttribute("data-theme", theme!);
});

test("tablet: Esc fecha a sidebar sobreposta e devolve o foco", async ({ page, isMobile }) => {
  test.skip(isMobile, "viewport de tablet no projeto desktop");
  await page.setViewportSize({ width: 900, height: 800 });
  await login(page);
  await page.waitForLoadState("networkidle");
  const expand = page.getByRole("button", { name: "Expandir menu" });
  await expand.click();
  await expect(page.getByRole("button", { name: /Recolher menu/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(expand).toBeVisible();
  await expect(expand).toBeFocused();
});
