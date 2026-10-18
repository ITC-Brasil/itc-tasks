import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes, login } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

async function createTask(page: Page, title: string, project: string) {
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: project }).click();
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();
}

test.beforeEach(({ isMobile }) => {
  test.skip(!email || !password, "SEED_ADMIN_* não definidos");
  test.skip(isMobile, "Kanban e Lista: desktop (mobile no Módulo 11)");
});

test("Kanban move o card, filtros vão para a URL e a Lista atualiza em massa", async ({ page }) => {
  test.slow(); // fluxo longo com axe nos dois temas em duas telas
  const title = `E2E visão ${Date.now()}`;
  await login(page);
  await createTask(page, title, "QMPR · QMPR");

  // filtro por Projeto/Cliente na URL
  await page.goto("/tarefas/lista");
  await page.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "QMPR · QMPR" }).click();
  await page.keyboard.press("Escape");
  await page.waitForURL(/projeto=/);
  await page.getByRole("row").filter({ hasText: title }).waitFor();

  // em massa: tarefas de execuções anteriores vão para o Backlog (à esquerda), e as colunas
  // que o teste usa ficam só com o card deste teste
  const old = page
    .getByRole("row", { name: /E2E visão/ })
    .filter({ hasNotText: title })
    .filter({ hasNotText: "Backlog" });
  const n = await old.count();
  if (n > 0) {
    for (let i = 0; i < n; i++) await old.nth(i).getByRole("checkbox").check();
    const bar = page.getByRole("toolbar", { name: "Ações em massa" });
    await bar.getByLabel("Mover para…").click();
    await page.getByRole("option", { name: "Backlog" }).click();
    await expect(page.getByText(/tarefas? atualizadas?$/)).toBeVisible();
    await expect(old).toHaveCount(0);
  }

  await page.getByRole("link", { name: "Kanban" }).click();
  await page.waitForURL(/\/tarefas\?projeto=/);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  await expect(card).toBeVisible();

  // arrastar para a coluna "Em andamento" (categoria in_progress)
  const target = page.getByRole("region", { name: "Em andamento" });
  // teclado (UI.md §5): espaço pega, seta move, espaço solta
  const grip = card.getByRole("button", { name: /^Mover TI-/ });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true"); // arraste começou
  const live = page.getByRole("status").filter({ hasText: "Draggable item" });
  const before = await live.textContent();
  await page.keyboard.press("ArrowRight");
  // o alvo novo é anunciado depois da colisão; soltar antes disso devolve o card
  await expect(live).not.toHaveText(before ?? "");
  const moved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.keyboard.press("Space");
  await expect(target.getByRole("link", { name: title })).toBeVisible();
  await moved;
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Em andamento" }).getByRole("link", { name: title }),
  ).toBeVisible();
  await axeBothThemes(page);

  // mouse pela alça: volta para "A fazer"
  const done = page.getByRole("region", { name: "A fazer" });
  const handle = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title }) })
    .getByRole("button", { name: /^Mover TI-/ });
  // no centro: com scrollIntoViewIfNeeded a alça podia ficar colada no topo (y≈20) e o arrasto
  // na mesma altura passava pelo cabeçalho da coluna, fora da lista onde se solta (M-039)
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = (await handle.boundingBox())!;
  const to = (await done.getByRole("list").boundingBox())!; // a lista ocupa a altura da coluna
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, from.y, { steps: 20 }); // mesma altura, sem rolar
  await page.waitForTimeout(100);
  const back = page.waitForResponse((r) => r.request().method() === "POST");
  await page.mouse.up();
  await expect(done.getByRole("link", { name: title })).toBeVisible();
  await back;

  // Lista mantém o filtro; seleção em massa muda a prioridade
  await page.getByRole("link", { name: "Lista" }).click();
  await page.waitForURL(/\/tarefas\/lista\?projeto=/);
  await page
    .getByRole("checkbox", { name: /^Selecionar TI-/ })
    .first()
    .waitFor();
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("checkbox").click();
  const bar = page.getByRole("toolbar", { name: "Ações em massa" });
  await expect(bar).toContainText("1 selecionada");
  await bar.getByLabel("Prioridade…").click();
  await page.getByRole("option", { name: "Urgente" }).click();
  await expect(page.getByText("1 tarefa atualizada").last()).toBeVisible();
  await expect(row).toContainText("Urgente");
  await axeBothThemes(page);
});
