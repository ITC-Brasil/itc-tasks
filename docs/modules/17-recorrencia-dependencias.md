# Módulo 17 — Recorrência, Aguardando com motivo e dependências

Três funcionalidades aprovadas pelo Matheus em 12/11/2026 (itens 1 a 3 do backlog),
`PROMPT_MODULO_17.md`. Sessão sem supervisão, na branch `feat/17-recorrencia-dependencias` a partir
da `develop` depois do merge do PR #43 (`02ea0ac` na `main`), com merge na `develop` ao fim de cada
item. ADR-077 a ADR-079; migrações `0021_task_recurrences`, `0022_waiting_fields` e
`0023_task_links_no_self` (só aditivas).

## Decisões a confirmar

Escolhas feitas sem o Matheus, sempre a mais conservadora. Cada uma diz onde mudar.

**Revisão (M-158, 18/11/2026):** o Matheus aceitou 1 a 7 e 9 a 11 como estão; a 8 foi substituída
pelo ADR-080 (ajuste 1). A parte final de "Ajustes da revisão" diz o que mudou.

1. **Dependência reaproveita `task_links`** (ADR-079), em vez da tabela nova sugerida
   (`task_dependencies`). A tabela já era "bloqueia" com chave e cascade; os vínculos `blocks`
   antigos viram dependência sem cópia. A seção "Vínculos" do detalhe ficou só com "relacionada a".
2. **Worker parado / pausa / edição** (ADR-077): cria só a ocorrência mais recente pendente. O piso
   é o dia da última edição da regra (`updated_at`): pausar, retomar ou editar não recria o que
   passou. Ao **criar ou retomar** uma regra num dia de ocorrência, a tarefa de hoje sai na hora
   (senão sairia só no dia seguinte, atrasada).
3. **Prazo da recorrência em dias corridos** a partir da data da ocorrência ("vence em 0 dias" = no
   mesmo dia), 0 a 60. O `dueInDays` dos templates é em dias úteis; ao preencher a regra com um
   template, o número é copiado como está.
4. **Criador da tarefa recorrente = dono da regra**; responsável vem da regra (pode ficar sem). Se o
   dono for desativado, as regras dele são pausadas (A1, corrigida na revisão).
5. **Excluir regra é definitivo** (é planejamento, como ciclos); as tarefas criadas ficam, sem o selo,
   e o histórico guarda o nome ("criou a tarefa pela recorrência “X”").
6. **Aviso de desbloqueio usa o tipo `status_changed`** com `data.unblockedBy` (sem tipo novo nas
   preferências): quem desligou "Status mudou" não recebe o desbloqueio.
7. **Lembrete da previsão do Aguardando usa `due_today`** com `data.waiting`, como pedido no prompt
   (mesma preferência do "Prazo hoje").
8. ~~Automação que move para Aguardando falha~~ — **substituída pelo ADR-080**: a ação guarda
   motivo, texto e previsão "daqui a N dias"; regra antiga sem os campos continua falhando com
   registro.
9. **Criação já em Aguardando**: o service exige os campos (`insertTask`), mas a criação rápida não
   tem o diálogo; por isso a coluna Aguardando do Kanban não mostra "Nova tarefa". A tarefa entra no
   Aguardando arrastando ou pelo detalhe.
10. **Mover pessoal → equipe com dependência é recusado** ("Remova as dependências antes de mover
    para a equipe"), sem apagar nada.
11. **Cancelar no Kanban** testado no service e no detalhe (E2E `waiting.spec.ts`); o E2E do arrasto
    por teclado cobre só o caminho confirmado (depois de um cancelamento, o segundo arrasto por
    teclado do dnd-kit não anuncia no Playwright; manualmente não foi possível conferir nesta sessão).

**Para o Cowork atualizar o artefato do Design System:**

| Componente | Onde | Ícone e tokens |
|---|---|---|
| Selo de recorrência (`RecurringMark`) | `src/components/tasks/task-card.tsx`; rodapé do card e linha "Criada pela recorrência X" no detalhe | `Repeat` 14 px, `strokeWidth 1.75`, `text-muted`; `role="img"` "Recorrente" |
| Diálogo do Aguardando | `src/components/tasks/waiting.tsx` (`useWaitingPrompt`) | Dialog do DS: "Aguardando o quê?", Select Motivo, campo "Descreva" (só com Outro, até 120), data prevista com `min` = hoje; Cancelar `secondary` + Confirmar |
| Motivo e previsão (`WaitingInfo`) | card (categoria `waiting`) e propriedades do detalhe | `CalendarClock` 14 px `text-muted` + "Compra · 20 nov" `text-xs tabular-nums`; legado: "Sem previsão" |
| Indicador "previsão vencida" | mesmo `WaitingInfo` | ícone `CalendarClock` em `warn` (só o ícone), texto para leitor de tela "(previsão vencida)"; não usa `err` |
| Indicador "Bloqueada" (`BlockedMark`) | `src/components/tasks/dependencies.tsx`; card e título da seção | `Link2Off` 14 px em `warn` (só o ícone); `role="img"` "Bloqueada" |
| Seção Dependências | detalhe, antes de Vínculos | grupos "Bloqueada por" / "Bloqueia" (`h3 text-xs text-muted`), concluída riscada em `text-muted`, X para remover; Select do tipo + busca com lista de até 6 resultados (`bg-popover shadow-2`) |
| Confirmar conclusão com bloqueadora | detalhe | Dialog "Concluir com bloqueadora aberta?" com "Concluir mesmo assim" |
| Tela Recorrências | `src/app/(app)/recorrencias/` | Card por regra com `Repeat`, chips "Pessoal" (`Lock`) e "Pausada"; diálogo com fieldsets "Quando" e "Tarefa criada" |

## Item 1 — Tarefas recorrentes (ADR-077)

- `src/db/schema/tasks.ts` — `taskRecurrences` (frequência `weekdays`/`weekly`/`monthly` com
  `CHECK`, `weekdays smallint[]`, `month_day` 0 = último dia, `interval_months` 1–12 com `CHECK`,
  `start_date`, `due_in_days`, `due_time`, `payload jsonb`, `paused_at`), `taskRecurrenceRuns`
  (PK `(recurrence_id, run_on)`, `task_id` `SET NULL`) e `tasks.recurrence_id` (`SET NULL`).
- `src/lib/recurrence.ts` — `occursOn`, `latestOccurrence` (varre para trás até 400 dias),
  `nextOccurrence`, `describeRule`. Dia 29–31 em mês curto cai no último dia.
- `src/lib/validation/recurrences.ts` — `recurrenceSchema`; o payload é `recurrencePayloadSchema`
  (`src/lib/validation/tasks.ts`).
- `src/server/services/recurrences.ts` — `listRecurrences` (`visibleRules`: equipe ou do dono),
  `saveRecurrence` (só `user`; `assertTaskRefs` confere projetos, UMs, etiquetas, envolvidos e
  responsável), `setRecurrencePaused`, `deleteRecurrence`, `runRecurrence` (trava a regra
  `FOR UPDATE`, grava a linha de `task_recurrence_runs` com `ON CONFLICT DO NOTHING` antes da tarefa;
  ator `automation` com `automationId` = id da regra) e `dailyRecurrences` (erro numa regra vai
  para o log e não para as outras).
- `insertTask` ganhou `opts.creatorId` e `opts.recurrence` (`src/server/services/tasks.ts`).
- `worker/index.ts` — fila `recurrence.daily`, `0 6 * * *` em `APP_TIMEZONE`.
- Tela `/recorrencias` (`page.tsx` lê `?tarefa=N` para "Repetir esta tarefa"), item no menu
  (`src/components/layout/nav.ts`), selo no card, link no detalhe. `FormDialog` ganhou
  `defaultOpen`; `DialogContent` passou a rolar quando é mais alto que a tela.
- MCP `list_recurrences` (`tasks:read`).

## Item 2 — Motivo e previsão no Aguardando (ADR-078)

- `0022`: enum `waiting_reason` e `tasks.waiting_reason`/`waiting_note`/`waiting_until`.
- `src/server/services/tasks.ts` — `checkWaiting` (par completo, nota com "Outro", data ≥ hoje de
  Brasília quando muda); `applyUpdate` resolve status de/para uma vez e: entrar exige e grava
  (`status_changed.payload.waiting`), sair limpa (`waitingCleared`), editar dentro grava
  `field_changed {field:"waiting"}`, campos fora do Aguardando → `VALIDATION`. `insertTask`
  também exige. `moveTask`, `bulkUpdateSchema` e o MCP (`waitingReason`, `waitingNote`,
  `waitingUntil`) passam os campos.
- `src/server/services/notifications.ts` — `reminders()` avisa o responsável no dia da previsão
  (`due_today`, `data.waiting`), sem repetir em 20 h.
- UI: `src/components/tasks/waiting.tsx`; Kanban (`board.tsx`) pergunta no drop e devolve o card ao
  cancelar; massa (`task-table.tsx`); detalhe com "Editar"/"Completar"; filtro `?motivo=`.

## Item 3 — Dependências (ADR-079)

- `0023`: `CHECK task_links_no_self_ck` e índice `task_links_to_idx`.
- `src/server/services/tasks.ts` — `linkRow` (outra ponta por `visibleTo`; mesma visibilidade),
  `reaches` (CTE recursiva) sob `pg_advisory_xact_lock(hashtext('task_dependencies'))`,
  `recordLink` (eventos nos dois lados), `releaseBlocked` (evento `unblocked` ao concluir a última
  bloqueadora), `openBlocker` (campo `blocked` do `listTasks` e filtro `?bloqueada=1`), recusa na
  conversão pessoal → equipe, `dependency_removed {deleted:true}` no outro lado da exclusão.
- Fanout `unblocked` → `status_changed` com `unblockedBy`.
- UI: `src/components/tasks/dependencies.tsx` (seção com busca pelo `searchTasksAction`,
  `BlockedMark`), confirmação ao concluir no detalhe, checkbox "Bloqueadas" na barra de filtros.
- MCP: `get_task` → `blockedBy`/`blocks`; `update_task` → `blockedByAdd`/`blockedByRemove`.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Datas: dias úteis, semanal, 31 em mês de 30, 29/02, último dia, a cada 3 meses virando o ano | `src/lib/recurrence.test.ts` | ✅ 6 testes |
| Ocorrência de hoje, idempotência, worker parado, fuso (01:00 UTC = dia anterior), pausa, pessoal, agente, exclusão, regra quebrada | `tests/integration/recurrences.test.ts` | ✅ 7 testes |
| Aguardando: obrigatório em detalhe, Kanban, massa, criação; Outro sem texto; data passada; limpeza; legado; filtro; lembrete uma vez | `tests/integration/waiting.test.ts` | ✅ 4 testes |
| Dependência: ciclo de 3, auto, eventos, filtro, MCP, desbloqueio com 2 bloqueadoras, pessoal × equipe sem vazar, cascade | `tests/integration/dependencies.test.ts` | ✅ 4 testes |
| MCP: `list_recurrences` só leitura; `update_task` waiting sem campos → `VALIDATION`; `blockedByAdd`/ciclo/`blockedByRemove` | `tests/integration/mcp.test.ts` | ✅ |
| Suíte Vitest completa | `npm test` | ✅ 214 testes, 38 arquivos |
| E2E contra o build de produção (`next start -p 3200`), 2 workers | `npx playwright test --workers=2` | ✅ 84 passed, 53 skipped (mobile) |
| Telas novas com axe nos dois temas | `recurrences.spec.ts`, `waiting.spec.ts`, `dependencies.spec.ts`, `views.spec.ts` | ✅ |

Com 6+ workers nesta máquina a suíte E2E tem timeouts de carga (não ligados ao módulo); em série e
com 2 workers passa.

## Auditoria de segurança (só o que o módulo mudou)

| # | Área | Achado | Situação |
|---|---|---|---|
| A1 | Recorrência | Regra de pessoa desativada continua criando tarefas em nome dela (o `assertAssignee` só olha o responsável) | Corrigido na revisão: `setMemberActive` pausa as regras (equipe e pessoais) com log `[members] recorrências pausadas`; só o admin retoma a regra de pessoa desativada |
| A3 | Dependências | `deleteTasks` registrava `dependency_removed {deleted}` no outro lado sem olhar a visibilidade (vínculo antigo pessoal × equipe vazaria o TI-n); a CTE `reaches` atravessava esses vínculos | Corrigido na revisão (M-158): os dois só seguem vínculos de mesma visibilidade |
| A2 | Dependências | Vínculo `blocks` antigo (antes do ADR-079) entre pessoal e equipe faria o card da equipe mostrar "Bloqueada" e o desbloqueio citar o TI-n da pessoal | Corrigido em `openBlocker`/`releaseBlocked` (mesma visibilidade) |
| — | Job de recorrência | Idempotência por PK; ator `automation`; regra pessoal só cria tarefa pessoal do dono; `visibleRules` igual ao `visibleTo` | Sem achado |
| — | Dependências | Outra ponta por `visibleTo`: pessoal de outra pessoa dá o mesmo `NOT_FOUND` de inexistente, no app e no MCP; a mensagem de ciclo só cita as duas tarefas visíveis; leitura dos vínculos filtra a outra ponta | Sem achado |
| — | Aguardando | Todas as entradas passam por `insertTask`/`applyUpdate`; Zod no servidor; data comparada no fuso de Brasília | Sem achado |
| — | SQL | SQL cru só no service (`reaches`, `openBlocker`, advisory lock), com parâmetros | Sem achado |

## Ajustes da revisão (M-158)

| # | Ajuste | Onde | Verificação |
|---|---|---|---|
| 1 | Automação "Mover para o status" com destino Aguardando guarda `waiting: { reason, note?, inDays }` (ADR-080); a previsão é `addDays(todayISO(), inDays)` no dia em que roda; `saveRule` recusa destino `waiting` sem os campos e descarta os campos em outro destino | `src/lib/validation/automations.ts`, `src/server/services/automations.ts`, `src/app/(app)/config/automacoes/automations-client.tsx` | `automations.test.ts` (salvar, rodar, regra antiga falha com registro, outro destino); E2E `automations.spec.ts` ✅ |
| 2 | Desativar membro pausa as recorrências dele | `src/server/services/members.ts`, `src/server/services/recurrences.ts` | `recurrences.test.ts` "A1" ✅ |
| 3 | Excluir a última bloqueadora aberta gera `unblocked` com `deleted: true`; histórico "foi desbloqueada: TI-n excluída"; aviso "excluiu TI-n e desbloqueou" | `deleteTasks` em `src/server/services/tasks.ts`, `activity.ts`, `src/lib/notifications.ts` | `dependencies.test.ts` ✅ |
| 4 | `dependency_removed` na exclusão e `reaches` só pela mesma visibilidade | `src/server/services/tasks.ts` | `dependencies.test.ts` (vínculos antigos inseridos direto) ✅ |
| 5 | `0023` e auto-vínculo em produção | — | ✅ O Matheus rodou em produção em 18/11/2026 `SELECT count(*) FROM task_links WHERE from_task_id = to_task_id;` → **0**: a `0023` passa. Pelo código já era esperado: o único escritor (`linkRow`) recusa auto-vínculo desde `e8cce78`, antes do go-live |

Módulo aprovado na M-160 (18/11/2026). Observação do Cowork: o ADR-080 entrou no mesmo commit do código; nos próximos módulos o ADR vai num commit próprio antes do código.

Os ajustes 3 e 4 mexem na mesma função e no mesmo teste: um commit.

## Commits

```
8000bc4 docs: add module 17 prompt
329b1c1 docs: add ADR for recurring tasks
2dbb7a8 feat(db): add task recurrences
feb5a20 feat(recurrence): recurrence service and daily job
ed38ce2 feat(ui): manage recurrences
9bdd385 feat(mcp): list recurrences
80cb7ae fix(ui): scroll dialogs taller than the viewport
539d7c6 test(recurrence): dates, idempotency, stopped worker, personal and screen
3b1ffa9 docs: add ADR for waiting reason and expected date
1368ec7 feat(db): add waiting fields to tasks
78b45b9 feat(tasks): require reason and expected date when waiting
4788684 feat(notifications): remind on expected date
8339b62 feat(ui): waiting dialog, card and filter
e044f94 fix(ui): read the waiting note once in the task detail
8956667 test(tasks): waiting reason and expected date in every entry point
c1b07f5 docs: add ADR for task dependencies
94a2002 feat(db): add task dependencies
482bef7 feat(tasks): dependencies service
e661462 feat(ui): dependencies in task detail and card
447f6ec feat(mcp): dependencies in get_task and update_task
f0ebf69 fix(ui): name the blocked filter and weekday checkboxes
b185105 test(tasks): dependencies cycle, personal scope, cascade, unblock and MCP
```

Mais o `security(tasks)` da A2 e o commit de docs/ajuda do fechamento. Revisão:

```
5d68f48 feat(automations): waiting reason and forecast on setStatus to Aguardando (ADR-080)
cd2ddd2 security(recurrences): pause a deactivated member's rules; only admin resumes
f826510 security(tasks): unblock on delete; keep legacy personal-team links out of delete events and cycle check
```

## Pontos de atenção

- `npm run db:migrate` aplica `0021`, `0022` e `0023`; o worker precisa reiniciar para agendar
  `recurrence.daily`.
- O `drain()` de `tests/integration/automations.test.ts` processa todos os jobs
  `automation.evaluate` do banco de teste; depois de muitas rodadas locais o `beforeAll` passa de
  10 s. Limpar a fila no `itc_tasks_test` resolve (no CI o banco é novo).
- `next build` às vezes para com um aviso de segurança do Next.js na primeira execução e passa na
  segunda; registrado para o Matheus decidir a atualização (versão fixa do stack).

## Fora do módulo

Ferramenta MCP de escrita de recorrência; feriados nos dias úteis; aviso perto da hora da previsão;
dependência bloqueando de fato o fluxo.
