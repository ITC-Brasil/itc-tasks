# Módulo 16 — Ajustes de uso

Doze ajustes pedidos pelo Matheus em 17/11/2026 depois do uso diário do Módulo 15
(`PROMPT_MODULO_16.md`). Sessão sem supervisão, na branch `feat/16-ajustes-uso` a partir da
`develop` (`4834c1f`). ADR-071 a ADR-075; migrações `0019_due_time` e `0020_involved_people`
(só aditivas).

## Decisões a confirmar

Escolhas feitas sem o Matheus, sempre a opção mais conservadora. Cada uma tem onde mudar.

1. **URL do Início continua `/`** (item 8). O prompt permitia `/inicio` com redirect permanente;
   como `/` já é a raiz, o PWA (`start_url`, atalho do manifest) e os favoritos não quebram e não há
   redirect para manter. Só o nome mudou (navegação, `<title>` "Início · ITC Tasks", ⌘K, ajuda,
   manifest, barra inferior). Atalhos: `G` `M` continua e `G` `I` também leva ao Início.
2. **Aba Hoje no Kanban não tem os grupos "Atrasadas" e "Hoje"** (itens 8 e 9). O item 9 manda o
   Kanban da aba Hoje manter as colunas por status, o que conflita com os dois grupos do item 8.
   Ficou: colunas por status no Kanban (atrasadas marcadas pelo ícone em `err` no card); na Lista a
   ordem por prazo põe as atrasadas primeiro; as **subtarefas** aparecem num bloco próprio acima, em
   dois grupos "Atrasadas" e "Hoje", nos dois modos. O Calendário mostra as mesmas tarefas.
3. **Encerrar ciclo sem próximo** (item 2): a regra do Módulo 10 diz "marcadas vão para o próximo,
   desmarcadas ficam sem ciclo". Sem próximo ciclo, nenhuma pode ser levada e **todas as pendências
   ficam sem ciclo** (`field_changed` "tirou do ciclo" em cada uma). As concluídas continuam no
   ciclo encerrado.
4. **Lembrete com hora** (item 4): o worker só tem jobs diários (08:00 e 00:05). O lembrete "vence
   hoje" das 08:00 passa a dizer a hora ("vence hoje às 14:30"); a automação `task.overdue` e o
   aviso de vencida continuam no dia seguinte. Aviso perto do horário exigiria um job por minuto ou
   agendamento por tarefa no pg-boss: item próprio, se o Matheus quiser.
5. **Rastro da exclusão de ciclo/marco** (item 3): sem tabela nova; evento em cada tarefa
   ("removeu do Ciclo N, que foi excluído") e linha `[planning] ciclo excluído …` no log. Ver ADR-071.
6. **Envolvidos na criação rápida** (item 7): o diálogo de criação é um só (rápida = completa), então
   o campo entrou nele, só quando há envolvidos cadastrados. No card **não aparece**.
7. **Admin não cria token para outra pessoa** (item 11): saiu o seletor "Dono"; o segredo só existe
   para quem é dono. Ver ADR-074.
8. **Nomes das 4 cores novas** (item 12): `teal` (Verde-azulado), `sky` (Céu), `terracotta`
   (Terracota) e `mustard` (Mostarda), no lugar de `cyan`/`amber`/`red` sugeridos, que lembrariam o
   `accent`, o `warn` e o `err`. Ver ADR-075.

**Para o Cowork atualizar o artefato do Design System:**

| O quê | Valores / onde |
|---|---|
| Cor `teal` | claro `#c9e6dc` / `#e7f4ef` / `#1b4d40` · escuro `#1f4a3f` / `#1a302a` / `#b5e6d6` |
| Cor `sky` | claro `#c6e5f2` / `#e6f4fa` / `#14465c` · escuro `#1c4557` / `#1a2d37` / `#b3e1f4` |
| Cor `terracotta` | claro `#f5d0c0` / `#fbebe4` / `#76301a` · escuro `#5c2c1c` / `#3a2219` / `#f6c9b6` |
| Cor `mustard` | claro `#ecdfae` / `#f7f1da` / `#584612` · escuro `#4f4317` / `#332d17` / `#efe0a6` |
| Collapsible de Atividade | `src/components/tasks/task-detail.tsx`: `Collapsible` do Base UI, cabeçalho "Atividade · N" com `ChevronRight` 16 px girando 90° aberto, recolhido por padrão |
| Indicador de subtarefas no TaskCard | `src/components/tasks/task-card.tsx` `ChecklistProgress`: `ListChecks` 16 px `strokeWidth 1.75` + "2/5" em `text-muted tabular-nums`; todas concluídas → ícone em `ok`; `role="img"` com "2 de 5 subtarefas concluídas" |

(ordem de cada cor: `bg` / `unit-bg` / `fg`)

## Item 1 — Criação sem seleção herdada

A origem era o estado do `QuickCreate` (`src/components/tasks/quick-create.tsx`): `projectIds`,
`mobileUnitIds` e `cycleId` ficavam fora do `form` limpo depois de criar e sobreviviam ao fechar o
diálogo. `show()` agora zera os três a cada abertura (atalho `C`, "Criar tarefa", "+" da coluna,
`?criar=1`, template). Só o "Criar outra", com o diálogo ainda aberto, mantém a seleção. Nenhum
ponto de entrada passava contexto de projeto (o preset só leva `statusId`, `templateId` e
`personal`), então não houve caso de contexto explícito a preservar.

## Item 2 — Encerrar ciclo sem criar outro

`closeCycle` (`src/server/services/planning.ts`) não exige mais o próximo ciclo planejado. Sem ele,
`carryTaskIds` não vazio → `VALIDATION` "Não há próximo ciclo para levar as tarefas"; vazio → as
pendências ficam sem ciclo e o retorno é `{ next: null, carried: 0 }`. O diálogo de `/ciclos`
(`cycles-client.tsx`) explica "Sem próximo ciclo planejado: as N tarefas pendentes ficam sem ciclo"
e o botão não fica mais desabilitado. O MCP não tem ferramenta de encerrar ciclo (só
`list_cycles`), então nada mudou nele.

## Item 3 — Excluir ciclos e marcos (ADR-071)

`deleteCycle`/`deleteMilestone` → `deletePlanning(actor, kind, id)`: só `user` admin (agente de
admin recebe `ForbiddenError`). Numa transação: trava cada tarefa ligada com `lockTask`, zera
`cycle_id`/`milestone_id`, grava `field_changed` `{ field, from, to: null, deleted: "<nome>" }` e
apaga a linha. `describe()` (`src/server/services/activity.ts`) lê `deleted` como "removeu do
Ciclo N, que foi excluído" / "removeu do marco X, que foi excluído". UI: ícone de lixeira
(`DeletePlanningDialog`, `src/app/(app)/ciclos/delete-planning.tsx`) em ciclos ativo, planejados e
encerrados e nos cards de marco, só para admin, com a contagem de tarefas (`total` da linha).

## Item 4 — Horário opcional nos prazos (ADR-072)

- Banco: `tasks.due_time` e `checklist_items.due_time` (`time`, nulos), `0019_due_time`. No Drizzle
  um `customType` lê `"HH:MM"` (o driver devolve `"HH:MM:SS"`).
- Zod: `dueTime` `HH:MM` (`DUE_TIME_RE` em `src/lib/validation/tasks.ts`), `null` limpa.
- Service: `dueTimeFor`/`patchDueTime` em `src/server/services/tasks.ts` — hora sem data →
  `VALIDATION` "Defina a data antes da hora"; limpar a data limpa a hora. `dueTime` entra em
  `FIELDS` (evento "definiu o horário do prazo para 14:30").
- `src/lib/dates.ts`: `nowHM()`, `isOverdue(date, time, now)` (fuso `America/Sao_Paulo`) e
  `dueKey()` para ordenar (sem hora = fim do dia). Usados no card, na lista, no calendário, no
  detalhe (subtarefa vencida) e no `list_tasks` `overdue` do MCP.
- UI: `<input type="time">` "Horário" ao lado da data na criação, no detalhe e por subtarefa
  ("Horário de <subtarefa>"), desabilitado sem data. Exibição `17 nov 14:30` (`DueDate`).
- MCP: `dueTime` em `create_task`/`update_task` e por item em `checklistDue`; `get_task` e
  `list_tasks` devolvem `dueTime`.
- Lembretes: ver "Decisões a confirmar" 4.

## Item 5 — Comentários separados da Atividade

`Activity` em `src/components/tasks/task-detail.tsx` virou duas seções: **Comentários**
(`aria-labelledby="comments"`, contagem, lista e editor sempre visíveis) e **Atividade**
(`Collapsible.Root` do `@base-ui/react/collapsible`, `Collapsible.Trigger` dentro do `h2` com
`aria-expanded`, fechado por padrão, "Atividade · N"). O estado não é lembrado.

## Item 6 — Concluídas por técnico

`projectDashboard` devolve `byAssignee`: `user` não desativado `LEFT JOIN tasks` com o mesmo
`doneInPeriod` (período e Projeto/Cliente do painel, `teamOnly`), `count(tasks.id)`, ordem
decrescente e por nome. `/painel` mostra um `Card` por pessoa com `Avatar` e o número
("<n> concluídas" para leitor de tela). Pessoais não contam; quem não concluiu nada aparece com 0.

## Item 7 — Envolvidos (ADR-073)

- `involved_people` e `task_involved` (`0020_involved_people`); nome único sem diferenciar
  maiúsculas (`lower(name)`).
- Cadastro: `listInvolved`/`createInvolved`/`updateInvolved`/`setInvolvedArchived` em
  `src/server/services/catalog.ts`; tela `src/app/(app)/config/envolvidos/`.
- Tarefa: `involvedIds` na criação e no patch (lista substitui), `assertInvolved` (arquivado só
  continua se já estava), evento `involved_changed`, `getTaskByNumber().involved`; campo no detalhe
  e na criação.
- Filtro `?envolvido=` (`FILTER_PARAMS`, `taskFiltersSchema.involvedIds`) em Kanban, Lista,
  Calendário e filtros salvos; o seletor "Envolvido" só aparece com cadastro.
- MCP: `list_involved` (leitura) e `involvedIds` em criar/atualizar; `get_task` devolve `involved`.

## Item 8 — Início com a aba Hoje

Ver "Decisões a confirmar" 1 e 2. `src/app/(app)/page.tsx`: abas Hoje (padrão, `?aba=` vazio),
Minhas tarefas (`?aba=minhas`), Pessoais, Atribuídas, Criadas, Menções. Hoje = escopo de Minhas
tarefas (`visibility: "all", assigneeId`) filtrado para abertas com `due_date <= hoje`, mais
`listChecklistDue` das abertas do escopo com prazo até hoje (`TodaySubtasks`, com "Subtarefa", hora
e link `TI-n`). `EmptyState` "Nada para hoje". O endereço antigo sem `aba` agora abre Hoje.

## Item 9 — Kanban no Início

Modos Kanban (padrão) | Lista | Calendário, `?visao=`; o Kanban reaproveita `Board` (colunas de
`listStatuses`, tarefas por `position`), então arrastar chama o mesmo `moveTaskAction`. `V` `K`/`L`/`C`
seguem o `mine()` do `app-shell.tsx`. Os grupos por prazo dos Cards saíram.

## Item 10 — Progresso das subtarefas no card

`listTasks` traz `checklistTotal` e `checklistDone` por subconsulta correlacionada no próprio
`SELECT` (sem N+1). `ChecklistProgress` no rodapé do `TaskCard` (ver tabela do Design System).

## Item 11 — Tokens de MCP privados (ADR-074)

`listAgentKeys`, `listAgentActivity` e `revokeAgentKey` filtram pelo dono também para o admin;
`createAgentKeySchema` é `z.strictObject` sem `userId`. `revokeAllAgentKeys(actor, userId)` (só
admin pessoa) desativa os ativos e loga `[agents] tokens revogados userId=… count=… by=…`; em
Configurações › Membros, item "Revogar todos os tokens" com confirmação. Tabela de Papéis do
`CLAUDE.md` atualizada.

## Item 12 — 12 cores de projeto (ADR-075)

Tokens `--project-{teal,sky,terracotta,mustard}-{bg,unit-bg,fg}` nos dois temas
(`src/styles/globals.css`, mais as entradas `--color-project-*` do `@theme`), `PROJECT_COLORS` e
`PROJECT_COLOR_NAMES` (`src/lib/validation/catalog.ts`). O seletor percorre `PROJECT_COLORS`. Sem
migração (`projects.color` é texto validado no Zod). Tabela de contraste no ADR-075; menor par 6,64:1.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Segunda criação abre sem Projeto/UM | E2E `tasks.spec.ts` | ✅ |
| Encerrar sem próximo; levar sem próximo recusa | `planning.test.ts`, E2E `planning.spec.ts` | ✅ |
| Excluir ciclo/marco: membro e agente recusados, tarefa sem vínculo e com evento | `planning.test.ts`, E2E | ✅ |
| Hora sem data recusa; limpar data limpa hora; checklist idem | `tasks.test.ts` | ✅ |
| Atraso com hora, virada do dia e fuso (02:30 UTC = 23:30 de Brasília) | `src/lib/dates.test.ts` | ✅ |
| Prazo com hora na criação e no detalhe | E2E `tasks.spec.ts` | ✅ |
| Atividade recolhida, abre por teclado, axe nos dois temas | E2E `activity.spec.ts` | ✅ |
| Concluídas por técnico: pessoal não conta, zero aparece, ordem | `planning.test.ts`, E2E | ✅ |
| Envolvidos: cadastro, unicidade, arquivado, evento, filtro (inclui pessoal) | `involved.test.ts`, E2E `catalog.spec.ts` | ✅ |
| Início: título, abas, Hoje com atrasada/hoje/subtarefa, `G` `I` | E2E `home.spec.ts` | ✅ |
| Kanban do Início: arrastar muda status, `V` `L`/`V` `K` | E2E `home.spec.ts` | ✅ |
| Progresso de subtarefas na consulta e no card | `views.test.ts`, E2E `home.spec.ts` | ✅ |
| Admin não lista/revoga token alheio; `/api/auth/api-key/list` 404; revogar todos | `private-tokens.test.ts`, E2E `members.spec.ts` | ✅ |
| 12 cores ≥ 5:1 nos dois temas (texto sobre bg e unit-bg) | `src/lib/palette.test.ts` (25 casos) | ✅ |
| Axe com as 12 amostras e chip novo | E2E `catalog.spec.ts` | ✅ |
| Suíte local | `npm run lint && npm run typecheck && npm test` | ✅ 0 erros; Vitest 34 arquivos, 191 testes |
| E2E contra o build de produção (receita do PROGRESS) | `npx playwright test` | ✅ após os ajustes de espera (`7db5380`) |

Cada commit de código passou no `npm run typecheck` sozinho; o único que não passava
(`involved.test.ts` sem `projectIds`) foi corrigido por `--amend` antes de qualquer envio.

## Auditoria de segurança (só o que o módulo mudou)

| Categoria | Verificado | Resultado |
|---|---|---|
| Autorização — tokens (item 11) | service filtra por `reference_id = actor.userId` em listar, atividade e revogar; criar é `strictObject` sem `userId`; rotas `/api/auth/api-key/*` seguem 404 (ADR-058) | ✅ sem achado |
| Autorização — exclusão de ciclo/marco (item 3) | `actor.kind === "user"` e admin no service, não só na UI; `lockTask` com o ator; tarefa pessoal não tem ciclo/marco (`CHECK`) | ✅ sem achado |
| Escopo — aba Hoje e Kanban do Início (itens 8 e 9) | `listTasks` com `visibleTo(actor)` + `assigneeId`; `listChecklistDue` reaplica `visibleTo`; mover pelo `moveTaskAction` → `lockTask` | ✅ sem tarefa pessoal alheia |
| Validação de entrada | `dueTime` por regex `HH:MM`; `involvedIds` `uuid` máx. 20 e existência/arquivo no service; filtro `envolvido` `uuid` | ✅ |
| Vazamento de dado | revogar todos devolve só a contagem; log sem segredo; envolvidos sem login/notificação | ✅ |

## Commits

```
3b70a2b docs: add module 16 prompt
f46e855 fix(tasks): start task creation with empty project and unit
9e3eb17 test(tasks): second quick create opens without project and unit
0b4875f feat(planning): close a cycle without creating the next one
1eee3f6 test(planning): close the active cycle with no planned cycle
f4a09c8 docs: add ADR for deleting cycles and milestones
cbafc5f feat(planning): delete cycles and milestones
301b3fb test(planning): delete cycles and milestones as admin only
020dd22 docs: add ADR for optional due time
ec2429a feat(db): add optional due time to tasks and checklist items
de23a33 feat(tasks): optional due time in service and mcp
c5b78e9 feat(ui): pick and show due time
7280a0a feat(notifications): consider due time in overdue and reminders
bf3aa3c test(tasks): due time
84a1859 fix(ui): name the due time field Horário so it does not match Prazo
036b349 feat(ui): split comments from activity in task detail
f4d843f test(ui): comments and collapsed activity in task detail
e8023b8 feat(dashboard): completed tasks by assignee
17acfe0 test(dashboard): completed tasks by assignee
3e0466d docs: add ADR for involved people
1b957e5 feat(db): add involved people
1e6d40e feat(catalog): involved people registry
e32f20d feat(tasks): involved people on tasks
412e7f3 feat(ui): filter tasks by involved person
b808800 test(catalog): involved people
030bcfe feat(ui): rename my tasks page to home
d470704 feat(ui): today tab on home
64d2f25 test(ui): home and today tab
8374f8c feat(ui): kanban view on home
094ed62 test(ui): kanban view on home
14eb5cc feat(ui): checklist progress on task card
8916200 test(ui): checklist progress on task card
27f2198 docs: add ADR for private mcp tokens
021df9f security(agents): list only the actor's own tokens
93fbeaf feat(members): admin revokes all tokens of a member
968e425 test(agents): private tokens and revoke all
1afbe71 docs: update roles table in CLAUDE.md
84a5584 docs: extend ADR-068 palette
c400753 feat(design): four more project colors
68bb5b9 test(ui): contrast and axe for the twelve project colors
1b48088 refactor(mcp): read the subtask due once per item
eaad657 style: format planning spec
52b5859 style: explain the regexp in the palette test
7db5380 test(ui): wait for the subtask due action and match the cell exactly
```

(mais o commit da ajuda e o desta documentação, listados no PROGRESS)

## Pontos de atenção

- `today` em `TaskCard`, `TaskTable` e `TaskDetail` ficou opcional e sem uso (`ponytail:`): o atraso
  vem do `isOverdue`, que usa o relógio de quem renderiza. Perto da virada do horário o servidor e o
  navegador podem divergir por segundos.
- O E2E `mobile.spec.ts` "axe nos dois temas" leva ~1,7 min de 2 min no banco de dev local, que
  acumula centenas de tarefas de execuções anteriores; no CI (banco novo) é rápido.
- O `next build` local alterna entre falhar e seguir com o aviso de vulnerabilidade do Next.js
  16.4.2 (`SecurityFatalError`); repetir o comando segue. Atualizar o Next é item próprio.

## Fora do módulo

Módulo 17 (tarefas recorrentes, motivo e previsão no Aguardando, dependências) não foi começado.
Aviso perto do horário do prazo (Decisões a confirmar 4).
