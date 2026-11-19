import { expect, type Page, test } from "@playwright/test";
import { axeBothThemes, login } from "./session";

// Módulo 18 — usabilidade do Kanban e da navegação
test.beforeEach(({ isMobile }) => test.skip(isMobile, "Kanban e navegação: desktop"));

const PROJECT = "QMPR · QMPR";

/** Criação rápida da equipe com prazo; devolve o número (do toast). */
async function teamTask(page: Page, title: string, due?: string) {
  const dialog = page.getByRole("dialog", { name: "Criar tarefa" });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Projeto/Cliente").click();
  await page.getByRole("option", { name: PROJECT }).click();
  await page.keyboard.press("Escape");
  if (due) await dialog.getByLabel("Prazo").fill(due);
  // o toast anterior ainda pode estar saindo: espera um número que não estava lá
  const toasts = page.getByText(/^TI-\d+ criada$/);
  const before = await toasts.allTextContents();
  await dialog.getByLabel("Título").press("Control+Enter");
  await expect(dialog).toBeHidden();
  let text = "";
  await expect
    .poll(async () => {
      text = (await toasts.allTextContents()).find((t) => !before.includes(t)) ?? "";
      return text;
    })
    .not.toBe("");
  return text.match(/\d+/)![0];
}

async function setStatus(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name }).click();
}

const toastWith = (page: Page, text: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

test("busca por ID e texto, Voltar com filtros, toast único com Desfazer e convite", async ({
  page,
}) => {
  test.slow();
  const run = Date.now();
  await login(page);
  const number = await teamTask(page, `E2E busca ${run}`);
  // item 4: um toast por vez
  await teamTask(page, `E2E busca outra ${run}`);
  await expect(page.locator("[data-sonner-toast][data-visible=true]")).toHaveCount(1);

  // item 7: `/` foca; ID e texto vão para ?q=
  await page.goto("/tarefas");
  const search = page.getByRole("searchbox", { name: "Buscar tarefas" });
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(search).toBeFocused({ timeout: 1000 });
  }).toPass();
  await page.keyboard.type(`ti${number}`);
  await page.waitForURL(new RegExp(`q=ti${number}`));
  await expect(page.getByRole("link", { name: `E2E busca ${run}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `E2E busca outra ${run}` })).toHaveCount(0);
  await search.fill(`semresultado${run}`);
  await expect(page.getByText(`Nenhuma tarefa encontrada para “semresultado${run}”`)).toBeVisible();
  await search.press("Escape");
  await page.waitForURL((u) => !u.searchParams.has("q"));
  await search.fill(`busca ${run}`);
  await page.waitForURL(/q=busca/);
  await expect(page.getByRole("link", { name: `E2E busca outra ${run}` })).toBeVisible();

  // item 2: o Voltar devolve para a Equipe com a busca
  await page.getByRole("link", { name: new RegExp(`E2E busca ${run}$`) }).click();
  await page.waitForURL(`/tarefas/${number}`);
  const back = page.getByRole("link", { name: "Voltar para Equipe" });
  await expect(back).toHaveAttribute("href", /\/tarefas\?q=busca/);

  // itens 8 e 9: concluir mostra as duas ações; Desfazer volta
  await setStatus(page, "Concluído");
  const done = toastWith(page, `TI-${number} concluída`);
  await expect(done.getByRole("button", { name: "Adicionar comentário" })).toBeVisible();
  await axeBothThemes(page);
  await done.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText(`TI-${number}: mudança desfeita`)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status" })).not.toHaveText(/Concluído/);

  // Desfazer recusa quando a tarefa mudou depois
  await setStatus(page, "Concluído");
  const again = toastWith(page, `TI-${number} concluída`);
  await expect(again).toBeVisible();
  await page.getByRole("combobox", { name: "Prioridade" }).click();
  await page.getByRole("option", { name: "Alta" }).click();
  await page.waitForLoadState("networkidle");
  await again.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("A tarefa mudou desde então")).toBeVisible();

  // convite a comentar: o detalhe abre com o editor focado
  // (vindo de outra página: no mesmo detalhe só o hash mudaria, sem montar de novo)
  await page.goto("/tarefas");
  await page.goto(`/tarefas/${number}#comentar`);
  await expect(page.locator("#comentar [contenteditable]")).toBeFocused();
});

test("ordem por prazo, borda de atrasada, compacto no Concluído, contador e Atrasadas", async ({
  page,
}) => {
  test.slow();
  const run = Date.now();
  await login(page);
  const later = await teamTask(page, `E2E ordem depois ${run}`, "2099-06-02");
  const sooner = await teamTask(page, `E2E ordem antes ${run}`, "2099-06-01");
  const late = await teamTask(page, `E2E ordem atrasada ${run}`, "2020-06-01");

  // item 1: prazo crescente, atrasada no topo
  await page.goto(`/tarefas?q=${encodeURIComponent(`ordem ${run}`)}`);
  const column = page.getByRole("region", { name: "A fazer" });
  const links = column.getByRole("link", { name: /E2E ordem/ });
  await expect(links).toHaveCount(3);
  const ids = (await links.allTextContents()).map((t) => t.match(/TI-(\d+)/)![1]);
  expect(ids).toEqual([late, sooner, later]);

  // item 5: atrasada com borda e texto para leitor de tela
  const lateCard = column.getByRole("listitem").filter({ hasText: `TI-${late}` });
  await expect(lateCard.locator("article")).toHaveClass(/border-err/);
  await expect(lateCard.getByRole("link", { name: /\(atrasada\)/ })).toBeVisible();

  // item 11: o número da Equipe leva ao filtro Atrasadas
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .locator('a[href="/tarefas?atrasadas=1"]')
    .click();
  await page.waitForURL(/\/tarefas\?atrasadas=1/);
  await expect(page.getByRole("checkbox", { name: "Atrasadas" })).toBeChecked();
  await page.getByRole("searchbox", { name: "Buscar tarefas" }).fill(`ordem ${run}`);
  await page.waitForURL(/q=ordem/);
  await expect(page.getByRole("link", { name: /E2E ordem/ })).toHaveCount(1);

  // itens 6, 8 e 10: concluir arrastando; card compacto com chevron; pé da coluna
  await page.goto(`/tarefas?q=${encodeURIComponent(`ordem antes ${run}`)}`);
  const grip = page.getByRole("button", { name: `Mover TI-${sooner}` });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  const doneColumn = page.getByRole("region", { name: "Concluído" });
  // A fazer → Em andamento → Aguardando → Concluído
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400); // a colisão nova é anunciada depois da seta
  }
  await expect(doneColumn.getByRole("listitem")).toHaveCount(1);
  const moved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.keyboard.press("Space");
  await moved;
  await expect(toastWith(page, `TI-${sooner} concluída`)).toBeVisible();
  await page.reload();
  const expand = doneColumn.getByRole("button", { name: `Expandir TI-${sooner}` });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(doneColumn.getByText(/^Concluída por /)).toBeAttached();
  await expand.click();
  await expect(doneColumn.getByRole("button", { name: `Recolher TI-${sooner}` })).toBeVisible();
  await expect(doneColumn.getByRole("link", { name: "Ver concluídas anteriores" })).toHaveAttribute(
    "href",
    /\/tarefas\/lista\?status=/,
  );
  await axeBothThemes(page);
});

test("nomes novos na navegação: Minhas Tarefas e Equipe", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "Minhas Tarefas", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Equipe", exact: true }).click();
  await expect(page).toHaveTitle("Equipe · ITC Tasks");
});
