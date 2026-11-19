import { expect, test } from "@playwright/test";
import { axeBothThemes, createTask, login, openFilters } from "./session";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

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
  await openFilters(page); // Módulo 18: linha recolhida
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

test("Kanban: mover para Aguardando pelo teclado (ADR-067)", async ({ page }) => {
  test.slow();
  const title = `E2E espera ${Date.now()}`;
  await login(page);
  await createTask(page, title, "QMPR · QMPR");
  // com o filtro do projeto o quadro fica leve, como no teste acima
  await page.goto("/tarefas/lista");
  await openFilters(page); // Módulo 18: linha recolhida
  await page.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: "QMPR · QMPR" }).click();
  await page.keyboard.press("Escape");
  await page.waitForURL(/projeto=/);
  // o arraste por teclado anda uma coluna: a tarefa parte de "Em andamento", vizinha de Aguardando
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("checkbox").check();
  await page.getByRole("toolbar", { name: "Ações em massa" }).getByLabel("Mover para…").click();
  await page.getByRole("option", { name: "Em andamento" }).click();
  await expect(row).toContainText("Em andamento");

  await page.getByRole("link", { name: "Kanban" }).click();
  await page.waitForURL(/\/tarefas\?projeto=/);
  const target = page.getByRole("region", { name: "Aguardando" });
  const grip = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title }) })
    .getByRole("button", { name: /^Mover TI-/ });
  const live = page.getByRole("status").filter({ hasText: "Draggable item" });
  const drag = async () => {
    await grip.focus();
    await page.keyboard.press("Space");
    await expect(grip).toHaveAttribute("aria-pressed", "true");
    const before = await live.textContent();
    await page.keyboard.press("ArrowRight");
    await expect(live).not.toHaveText(before ?? "");
    await page.keyboard.press("Space");
  };
  // ADR-078: o diálogo pede motivo e previsão (o cancelar está no waiting.spec, no detalhe)
  const dialog = page.getByRole("dialog", { name: "Aguardando o quê?" });
  await drag();
  await dialog.getByRole("combobox", { name: "Motivo" }).click();
  await page.getByRole("option", { name: "Fornecedor" }).click();
  await dialog.getByLabel("Data prevista").fill("2099-12-31");
  const moved = page.waitForResponse((r) => r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(target.getByRole("link", { name: title })).toBeVisible();
  await moved;
  await expect(target.getByRole("listitem").filter({ hasText: title })).toContainText(
    /Fornecedor · 31 (de )?dez/,
  );
  await page.reload();
  await expect(target.getByRole("link", { name: title })).toBeVisible();
  await axeBothThemes(page);
  // continua aberta: aparece na Lista com o status novo
  await page.getByRole("link", { name: "Lista" }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("Aguardando");
});
