import { expect, test } from "@playwright/test";
import { axe, login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "tela de configuração: desktop");
});

test("cria token só-leitura, mostra uma vez, chama o /mcp e revoga", async ({ page, request }) => {
  test.slow();
  const name = `E2E ${Date.now()}`;
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await login(page);
  await page.goto("/config/agentes");
  await expect(page.getByRole("heading", { name: "Agentes e MCP", level: 1 })).toBeVisible();
  await axe(page);

  await page.getByRole("button", { name: "Novo token" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("combobox", { name: "Permissões" }).click();
  await page.getByRole("option", { name: /Só leitura/ }).click();
  await page.getByRole("button", { name: "Criar token" }).click();
  const token = await page.getByRole("textbox", { name: "Token", exact: true }).inputValue();
  expect(token).toMatch(/^itct_/);
  await page.getByRole("button", { name: "Concluir" }).click();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Só leitura");
  await expect(row).toContainText("Ativo");
  await expect(row).not.toContainText(token); // o segredo não volta à tela

  const listProjects = () =>
    request.post("/mcp", {
      headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_projects", arguments: {} },
      },
    });
  expect((await listProjects()).status()).toBe(200);

  await row.getByRole("button", { name: `Revogar ${name}` }).click();
  await expect(row).toContainText("Revogado");
  expect((await listProjects()).status()).toBe(401);
  expect(errors.filter((e) => /hydrat|#418/i.test(e))).toEqual([]);
});
