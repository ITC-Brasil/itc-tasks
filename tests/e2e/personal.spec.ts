import { expect, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// ADR-069: tarefa pessoal só aparece para quem criou; Minhas tarefas com abas e modos de visão
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "criação rápida, Lista e atalhos: desktop");
});

test("tarefa pessoal: criar, ver só em Minhas tarefas, trocar de visão e mover para a equipe", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const run = Date.now();
  const title = `E2E pessoal ${run}`;
  await login(page);

  // criar sem Projeto/Cliente: só com "Tarefa pessoal" marcada
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await expect(dialog.getByLabel("Projeto/Cliente")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Tarefa pessoal" }).click();
  await expect(dialog.getByLabel("Responsável")).toHaveCount(0); // sempre de quem cria
  await dialog.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(dialog).toBeHidden();

  // Minhas tarefas e Pessoais mostram; Atribuídas e as visões da equipe, não
  const link = page.getByRole("link", { name: title });
  await page.goto("/?aba=minhas");
  await expect(link).toBeVisible();
  const card = page.getByRole("listitem").filter({ has: link });
  await expect(card.getByText("Tarefa pessoal")).toBeAttached();
  const number = (await link.getAttribute("href"))!.split("/").pop()!;
  await page
    .getByRole("navigation", { name: "Abas" })
    .getByRole("link", { name: "Pessoais" })
    .click();
  await page.waitForURL(/\?aba=pessoais$/);
  await expect(link).toBeVisible();
  await axeBothThemes(page);
  await page.goto("/?aba=atribuidas");
  await expect(page.getByRole("navigation", { name: "Abas" })).toBeVisible();
  await expect(link).toHaveCount(0);
  await page.goto("/tarefas/lista");
  await page.getByRole("checkbox").first().waitFor();
  await expect(link).toHaveCount(0);

  // Cards | Lista | Calendário, com a aba mantida na URL; V K volta para Cards
  await page.goto("/?aba=pessoais");
  const views = page.getByRole("navigation", { name: "Visões" });
  await views.getByRole("link", { name: "Lista" }).click();
  await page.waitForURL(/\?aba=pessoais&visao=lista$/);
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  await axeBothThemes(page);
  await views.getByRole("link", { name: "Calendário" }).click();
  await page.waitForURL(/\?aba=pessoais&visao=calendario$/);
  await expect(page.getByRole("link", { name: "Próximo mês" })).toHaveAttribute(
    "href",
    /^\/\?aba=pessoais&visao=calendario&mes=\d{4}-\d{2}$/,
  );
  await axeBothThemes(page);
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await expect(page).toHaveURL(/\?aba=pessoais&visao=lista$/, { timeout: 1000 });
  }).toPass();
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("v");
    await page.keyboard.press("k");
    await expect(page).toHaveURL(/\?aba=pessoais$/, { timeout: 1000 });
  }).toPass();

  // outra pessoa: 404 pela URL e nada na busca nem nas abas dela
  const member = `pessoal-${run}@t.test`;
  await page.goto("/config/membros");
  await page.getByRole("button", { name: "Criar membro" }).click();
  const create = page.getByRole("dialog", { name: "Criar membro" });
  await create.getByLabel("Nome").fill(`Pessoal ${run}`);
  await create.getByLabel("E-mail").fill(member);
  await create.getByLabel("Senha inicial").fill("senha-de-teste-123");
  await create.getByRole("button", { name: "Criar membro" }).click();
  await expect(create).toBeHidden();
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const mp = await ctx.newPage();
  await mp.goto("/login");
  await mp.getByLabel("E-mail").fill(member);
  await mp.getByLabel("Senha").fill("senha-de-teste-123");
  await mp.getByRole("button", { name: "Entrar" }).click();
  await mp.waitForURL("/");
  await mp.goto(`/tarefas/${number}`);
  await expect(mp.getByText(/não encontrad/i).first()).toBeVisible();
  await expect(mp.getByText(title)).toHaveCount(0);
  await mp.goto("/?aba=pessoais");
  await expect(mp.getByText("Nenhuma tarefa pessoal aberta")).toBeVisible();

  // mover para a equipe exige Projeto/Cliente; depois a outra pessoa passa a ver
  await page.goto(`/tarefas/${number}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Só você vê esta tarefa.")).toBeVisible();
  await axeBothThemes(page);
  await page.getByRole("button", { name: "Mover para a equipe" }).click();
  await expect(
    page.getByText("Escolha um Projeto/Cliente antes de mover a tarefa para a equipe."),
  ).toBeVisible();
  await page.getByLabel("Projeto/Cliente").click();
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("option", { name: "QMPR · QMPR" }).click();
  await saved;
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Mover para a equipe" }).click();
  await expect(page.getByText(`TI-${number} movida para a equipe`)).toBeVisible();
  await expect(page.getByText("Só você vê esta tarefa.")).toHaveCount(0);
  await mp.goto(`/tarefas/${number}`);
  await expect(mp.getByRole("button", { name: title })).toBeVisible();
  await ctx.close();
});
