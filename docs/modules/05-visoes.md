# Módulo 05 — Visões e filtros

**Status:** pronto para revisão (17/10/2026), na `develop`. ADR-046 escrito antes do código.

PRD V1 a V5: Minhas tarefas, Kanban, Lista com ações em massa, Calendário mensal e filtros (com filtros salvos), todos lendo a mesma consulta.

## O que foi implementado

### Schema (`src/db/schema/planning.ts`, migração `drizzle/0008_saved_filters.sql`, só `CREATE`)
- `saved_filters (id, user_id → user ON DELETE cascade, name, view, filters jsonb, created_at)`, como já previsto em `docs/SCHEMA.md`. `view` ∈ `kanban | list | calendar`; `filters` guarda o objeto validado por `taskFiltersSchema`.

### Validação (`src/lib/validation/tasks.ts`)
- `FILTER_PARAMS`: parâmetro da URL → campo (`status`, `responsavel`, `projeto`, `um`, `prioridade`, `etiqueta`). Valor repetido = "qualquer um de".
- `taskFiltersSchema` (até 50 valores por campo), `parseTaskFilters(searchParams | URLSearchParams)`: parâmetro inválido é ignorado e não derruba a tela.
- `filtersQuery(filters)`: objeto → query string na ordem fixa de `FILTER_PARAMS`; serve para links e para reconhecer o filtro salvo ativo.
- `savedFilterSchema`: nome 1–60, `view`, `filters`.

### Services
- `listTasks(actor, filtros, escopo)` em `src/server/services/tasks.ts`: tarefas não arquivadas, ordenadas por `position`, limite de 1 000 linhas. Projeto/Cliente, UM e etiqueta filtram por subconsulta em `task_projects`, `task_mobile_units` e `task_labels` (qualquer vínculo, ADR-045). Escopo `{ assigneeId, creatorId, openOnly }` para Minhas tarefas. Vínculos (projetos, UMs, etiquetas) vêm em três consultas `inArray` e são agrupados em memória.
- `src/server/services/saved-filters.ts`: `listSavedFilters`, `createSavedFilter`, `deleteSavedFilter`, sempre filtrando por `user_id` do `Actor` (apagar filtro de outra pessoa → `NOT_FOUND`). Filtro salvo antigo inválido vira "sem filtro" (`.catch`).
- Ações em massa usam o `bulkUpdateTasks` do Módulo 04 (status, responsável, prioridade; tudo ou nada).

### Actions (`src/server/actions/tasks.ts`)
`moveTaskAction`, `bulkUpdateTasksAction`, `createSavedFilterAction`, `deleteSavedFilterAction`. Sem `revalidatePath`: a tela chama `router.refresh()`.

### Telas e componentes
- `src/server/views.ts` — `loadView(searchParams)`: filtros, tarefas, opções dos seletores, filtros salvos e "hoje" (Brasília).
- `/tarefas` (Kanban), `/tarefas/lista`, `/tarefas/calendario`; item "Tarefas" na sidebar (`src/components/layout/nav.ts`). Conteúdo em `<main>` dentro de `Suspense` (`cacheComponents`).
- `src/components/tasks/filter-bar.tsx` — seletor de visão (mantém a query), `PickMany` por filtro (Status só fora do Kanban; UMs dos projetos filtrados), "Limpar filtros", menu "Filtros salvos" (aplicar, "Salvar filtro atual…", excluir o ativo). Mudar filtro é `router.replace`.
- `src/components/tasks/task-card.tsx` — TaskCard do DS: `TI-n`, título (link), chips de todos os projetos/UMs/etiquetas, prioridade, prazo (ícone `err` quando vencido) e avatar.
- `src/components/tasks/board.tsx` — `@dnd-kit/react` 0.5.1 + `move` de `@dnd-kit/helpers` 0.5.1. Cada card tem uma alça "Mover TI-n" (`handleRef`); `onDragOver` atualiza o estado, `onDragEnd` chama `moveTaskAction` com `afterTaskId` e desfaz com toast se falhar. Contagem e "Nova tarefa" por coluna (abre a criação rápida com o status da coluna: `openQuickCreate({ statusId })`).
- `src/components/tasks/task-table.tsx` — TanStack Table 9.3.1 (`rowSelectionFeature`, `rowSortingFeature`, `createSortedRowModel`); ordenação por cabeçalho com `aria-sort`; barra "Ações em massa" (Mover para…, Atribuir a…, Prioridade…).
- `src/components/tasks/calendar.tsx` — grade mensal (domingo a sábado) com `?mes=YYYY-MM`, navegação mês anterior/hoje/próximo mantendo os filtros; vencida com borda `err`, concluída riscada.
- `src/app/(app)/page.tsx` — Minhas tarefas: abas Atribuídas / Criadas (`?aba=criadas`), só abertas, agrupadas em Vencidas, Hoje, Esta semana (até domingo), Depois (inclui sem prazo).
- `src/lib/dates.ts` — `todayISO` (America/Sao_Paulo), `dueBucket`, `shortDate`, `monthGrid`, `shiftMonth`.
- `src/components/tasks/no-results.tsx` — "Nenhuma tarefa com esses filtros" + "Limpar filtros" (Lista).

### Correção de acessibilidade (`src/components/layout/app-shell.tsx`)
O link do lockup tinha `aria-label="ITC Tasks, início"` sobre o texto visível "ITC"/"Tasks", o que o axe acusa como `label-content-name-mismatch`. Agora o nome vem do texto visível + `sr-only` ", início". Era a causa do "axe intermitente em `/config/projetos`" da M-029, junto com o limite de 30 s (abaixo).

## Ajustes da revisão (M-034)

- **ADR-047** (complementa o ADR-046), antes do código: `listTasks` faz duas consultas — abertas sem limite e concluídas por `completed_at desc` com `LIST_LIMIT` (1 000) — e junta por `position`. Opção `recentDone` (Kanban, via `loadView(searchParams, { recentDone: true })`) só traz concluídas com `completed_at` nos últimos 14 dias; Lista, Calendário e o filtro de status mostram todas.
- `LimitNotice` em `src/components/tasks/no-results.tsx`: quando `truncated`, "Mostrando as primeiras 1.000 tarefas concluídas; refine os filtros para ver as demais." nas três visões.
- Migração `drizzle/0009_saved_filters_user_idx.sql`: `CREATE INDEX "saved_filters_user_idx" ON "saved_filters" ("user_id")`.
- Testes em `tests/integration/views.test.ts`: concluída há 15 dias fora do Kanban e presente na Lista; com `doneLimit: 1`, as duas abertas vêm inteiras, só a concluída mais recente entra e `truncated` é `true`.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Filtro por projeto/UM pega qualquer vínculo, não só o principal | `tests/integration/views.test.ts` | ✅ |
| Prioridade e responsável combinados | idem | ✅ |
| Minhas tarefas: abertas, atribuídas ou criadas | idem (`completeTask` tira da lista) | ✅ |
| URL com parâmetro inválido é ignorada | idem (`parseTaskFilters`) | ✅ |
| Filtro salvo só do dono; nome vazio recusado | idem | ✅ |
| Prazos: vencida/hoje/semana/depois, hoje de Brasília, grade do mês | `src/lib/dates.test.ts` | ✅ |
| Kanban: mover por teclado (espaço, seta, espaço) persiste após recarregar | `tests/e2e/views.spec.ts` | ✅ |
| Kanban: arrastar com mouse pela alça | idem | ✅ |
| Filtro vai para a URL e a Lista o mantém | idem | ✅ |
| Lista: seleção em massa → status (limpeza) e prioridade | idem | ✅ "1 tarefa atualizada" |
| axe claro e escuro no Kanban e na Lista | idem | ✅ |
| Suíte | `npm test` / `npx playwright test` | ✅ Vitest 46; E2E 19 passaram, 11 pulados (mobile), 4 rodadas seguidas |
| Após a M-034 | idem | ✅ Vitest 48; E2E 19 |
| `npm run lint` / `npm run typecheck` | — | ✅ 0 erros (1 aviso antigo em `tasks.test.ts`) |

## Commits

```
6fa5151 docs(adr): add adr-046 views, url filters and saved filters
db4ac29 fix(a11y): make sidebar lockup name include its visible text
aa18b58 feat(tasks): add filters and saved filters
cfc771c feat(board): add kanban
9cf4855 feat(tasks): add list view
93dcec5 feat(tasks): add calendar view
6a08db8 feat(tasks): add my tasks
c40e4b7 test(e2e): cover board and list
4940677 docs: document module 05 views and filters
```

Revisão (M-034):

```
f9b4728 docs(adr): add adr-047 recent done tasks and done-only limit
add86f7 feat(tasks): limit only done tasks and keep 14 days of done on kanban
4e1403f feat(tasks): warn when done tasks hit the list limit
90c4512 perf(db): index saved_filters by user
```

## Ficou de fora

- Filtro por ciclo e "mudar ciclo" em massa — Módulo 10 (ciclos).
- "Arquivar" em massa — não há fluxo de arquivar tarefa ainda.
- Marcos no calendário — Módulo 10.
- Aba "Menções" em Minhas tarefas — Módulo 06 (comentários).
- Atalhos de duas teclas `V K` / `V L` / `V C`, `J`/`K`, `X` — `useShortcut` só trata uma tecla.
- Layout mobile das visões — Módulo 11 (E2E das visões pula o projeto mobile).

## Pontos de atenção

- **dnd-kit e React:** o `OptimisticSortingPlugin` move o nó no DOM. Sem atualizar o estado no `onDragOver` (com `move`), o React tenta remover o card da coluna antiga e quebra com `removeChild … not a child of this node`. Não trocar por atualização só no `onDragEnd`.
- **Card não é o arrastável:** um `li` com `role="button"` contendo o link do título viola `nested-interactive`/`aria-allowed-role`. Por isso a alça separada.
- **Teclado:** a seta escolhe o alvo mais próximo, que pode ser um card de outra coluna e não a coluna vazia do lado.
- **E2E no banco de dev:** os testes acumulam tarefas "E2E visão" no QMPR; o teste joga as antigas para o Backlog antes de arrastar. `test.slow()` em `catalog`, `tasks` e `views`: com os workers em paralelo e o `next dev`, esses fluxos passavam de 30 s.
- `listTasks` devolve `{ tasks, truncated }`: abertas nunca são cortadas; o limite de 1 000 vale só para as concluídas (ADR-047).
