# Módulo 10 — Ciclos, marcos e painel

**Data:** 18/10/2026 · **ADR:** ADR-053 (escrito antes do código) · **Migração:** nenhuma (tabelas desde o `0005_tasks`, ADR-042)

## O que foi implementado

### Service (`src/server/services/planning.ts`)
- **Ciclos:** `createCycle` (número `max + 1`, fim ≥ início pelo `cycleSchema` em `src/lib/validation/planning.ts`), `updateCycle` (só não encerrado), `startCycle` (recusa com "Encerre o Ciclo N antes de iniciar outro"; o índice `cycles_one_active_uq` é a defesa da corrida), `closeCycle(actor, id, { carryTaskIds })`.
- **Encerrar:** exige um ciclo `planned` (o de menor número); sem ele → `VALIDATION` "Crie o próximo ciclo antes de encerrar". Numa transação, cada tarefa não concluída e não arquivada recebe o próximo ciclo (se marcada) ou `null`, com `lockTask` e um `field_changed` `{ field: "cycle", from, to }` pelo `record()`. O próximo ciclo não é iniciado.
- **Leitura:** `listCycles` (com `done`/`total`), `activeCycle`, `getCycleByNumber`, `pendingTasks`, `cycleLoad` (abertas por responsável).
- **Marcos:** `listMilestones` (progresso = concluídas ÷ tarefas não arquivadas ligadas), `saveMilestone` (projeto arquivado recusado na criação; marco com tarefas não muda de projeto), `setMilestoneClosed` (concluir/reabrir via `closed_at`), `milestonesDue` (calendário).
- **Painel:** `projectDashboard({ projectId, days })` — `days` ∈ 7/30/90 (padrão 30). Tarefa "do projeto" = qualquer vínculo em `task_projects`. Abertas, vencidas (`due_date < hoje` de Brasília), concluídas no período, tempo médio `completed_at − created_at` em dias, 12 semanas de concluídas (segunda-feira, semanas sem conclusão com zero), abertas por status e por UM.
- Pessoa e agente planejam (`assertPerson`); `admin` e `member` igualmente.

### Tarefa (`src/server/services/tasks.ts`, `src/lib/validation/tasks.ts`)
- `cycleId` e `milestoneId` em criar e alterar; `cycleId` também na ação em massa (`bulkUpdateSchema`).
- `assertCycle`: inexistente → `NOT_FOUND`; encerrado → `ARCHIVED_REFERENCE`. `assertMilestone`: concluído → `ARCHIVED_REFERENCE`; de outro projeto → `VALIDATION` "O marco é de outro Projeto/Cliente". Tirar da tarefa o projeto do marco mantido → "Tire o marco antes de remover o Projeto/Cliente dele".
- Filtro `ciclo` (`cycleIds`) em `FILTER_PARAMS`; `getTaskByNumber` traz `cycleNumber` e `milestoneName`.
- Histórico (`src/server/services/activity.ts`): "moveu para o Ciclo N", "tirou do ciclo", "ligou ao marco X", "tirou do marco".

### MCP (`src/server/services/agents.ts`)
- `cycle: 'current' | number` em `create_task`, `update_task` e `list_tasks`; `'current'` sem ativo → `NOT_FOUND` "Nenhum ciclo ativo"; número inexistente → `NOT_FOUND`. Fim do `VALIDATION` da M-044. `list_cycles` usa `listCycles`.

### Telas
- `/ciclos` (`src/app/(app)/ciclos/`): ciclo ativo com progresso, carga por pessoa, "Ver no quadro" (`/tarefas?ciclo=<id>`), editar datas e "Encerrar ciclo" com a lista de pendências marcável; planejados com Iniciar; encerrados com link para a Lista filtrada.
- `/marcos` (`src/app/(app)/marcos/`): cards com ProjectChip, progresso, prazo (vencido em `err`), editar e concluir/reabrir.
- `/painel` (`src/app/(app)/painel/`): Projeto/Cliente e período na URL (`?projeto=&dias=`), 4 indicadores, gráfico de barras por semana (`src/components/ui/chart.tsx` do shadcn, Recharts 3.10.1, cor `var(--accent)`, tabela `sr-only` com os mesmos valores), barras de status e de UM.
- Detalhe da tarefa: seletores Ciclo e Marco (só marcos dos projetos da tarefa). Criação rápida: seletor Ciclo, mantido em "Criar outra". Lista: "Mudar ciclo…" em massa. Filtros: "Ciclo". Calendário: marcos abertos no dia do prazo (`Flag`).
- Navegação: Ciclos (`RefreshCw`), Marcos (`Flag`), Painel (`ChartColumn`). Atalho `G` `C` (`useGoTo` em `src/components/layout/shortcuts.tsx`, escuta na captura para o `C` não abrir também a criação rápida).

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Um ativo por vez; encerrar leva marcadas e solta desmarcadas; concluída fica | `tests/integration/planning.test.ts` | ✅ |
| Encerrar sem planejado recusa; ciclo encerrado recusado na tarefa | idem | ✅ |
| Marco de outro projeto, marco concluído, troca de projeto com tarefas | idem | ✅ |
| Painel: abertas 2, vencidas 1, concluídas 1, 12 semanas | idem | ✅ |
| MCP `cycle` por número grava e filtra; inexistente → `NOT_FOUND` | `tests/integration/mcp.test.ts` | ✅ |
| Suíte | `npm run test:integration` / `npm run test:unit` | ✅ 96 / 12 |
| Lint e tipos | `npm run lint`, `npm run typecheck` | ✅ 0 erros; avisos só os já existentes + 2 do `chart.tsx` gerado |
| Criar e iniciar ciclo, painel, marcos vazio, "Mudar ciclo…" em massa, histórico e seletor no detalhe | navegador no `next dev` | ✅ (sem erro no console) |

Sem E2E novo neste módulo.

## Commits

```
38093dd feat(planning): add cycles
1397f8d feat(planning): add milestones
aa7c506 feat(planning): add project dashboard
7b4a1a8 fix(planning): map unique races, archived project and dashboard timezone
```

## Revisão (M-061)

- `onUnique` em `planning.ts`: `23505` de `createCycle` ("Outro ciclo foi criado ao mesmo tempo. Tente de novo.") e de `startCycle` ("Já existe um ciclo ativo") vira `TaskError` `VALIDATION` em vez de 500.
- `saveMilestone` recusa Projeto/Cliente arquivado também na edição, salvo se já era o projeto do marco.
- Painel: a janela das 12 semanas usa `AT TIME ZONE 'America/Sao_Paulo'` como o agrupamento.
- Os três ajustes mexem no mesmo service e teste: um commit. Vitest integração 97.

O primeiro traz todo o `planningService` (inclusive marcos e painel), porque é um arquivo só; os outros dois trazem as telas.

## Ficou de fora

- Filtro por marco nas visões (o link "Tarefas do projeto" do marco filtra pelo projeto).
- Reordenar ou excluir ciclos (nada é excluído, ADR-053).
- E2E das três telas — Módulo 11, junto da auditoria axe.

## Pontos de atenção

- `shadcn add chart` instalou o pacote `cn` (alheio ao projeto), trocou `recharts` para 3.8.0 e criou `ui/card.tsx`; tudo desfeito. Ao rodar o CLI de novo, conferir `package.json`.
- O teste de planejamento encerra ciclos ativos/planejados do `itc_tasks_test` no `beforeAll` (banco compartilhado entre execuções, um ativo por vez).
- `closeCycle` grava um evento por tarefa: com muitas pendências o encerramento enfileira muitos fanouts (sem aviso a ninguém, `field_changed` de ciclo não notifica).
