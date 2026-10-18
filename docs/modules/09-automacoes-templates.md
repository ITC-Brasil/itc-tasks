# Módulo 09 — Automações e templates

**Status:** pronto para revisão. ADR-052 escrito antes do código (`3d37cfb`).

PRD A1 (regras "Quando → Se → Então" com liga/desliga, contador e última execução), A2 (5 gatilhos), A3 (ações; "topo da coluna" acrescentado por decisão do Matheus), A4 (6 regras no seed; "Etiquetar tarefas de UM" e, pela M-053, "Avisar quem criou quando concluir" desligadas) e P4 (templates de tarefa e de projeto; usar pede Projeto/Cliente e UM).

## O que foi implementado

### Schema
- `src/db/schema/automation.ts` — `automation_rules` (`trigger` texto, `conditions`/`actions` jsonb validados pelo Zod, `run_count`, `last_run_at`) e `automation_runs` (`ok`, `error`, índice `automation_runs_rule_created_idx`). Regras não são excluídas, só desligadas.
- `src/db/schema/enums.ts` — valor `automation` em `notification_event`.
- `src/db/schema/planning.ts` — `templates.archived_at` (arquivar, nunca excluir).
- Migração `drizzle/0011_automations.sql`, só aditiva (`ALTER TYPE … ADD VALUE`, `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`).
- Seed (`src/db/seed.mjs`): as 6 regras da tela de referência, só com a tabela vazia; regras 1 e 6 nascem desligadas (M-053); status "A fazer" e etiqueta "campo" resolvidos por subselect.

### Motor (`src/server/services/automations.ts`)
- `record()` (`src/server/services/tasks.ts`) enfileira `automation.evaluate` `{ eventIds, depth }` na mesma transação do fanout, só quando `triggerOf()` (`src/lib/validation/automations.ts`) acha gatilho: `created`, `status_changed`, `assigned` com responsável, `field_changed` de `priority`.
- `depth` vem do `Actor` `{ kind: "automation", automationId, depth }`; pessoa, agente e sistema → 0. `runRules` com `depth ≥ MAX_DEPTH` (3) não executa e grava o erro "Cadeia de automações passou de 3".
- Condições (`statusCategory`, `priority`, `hasGlpi`, `hasMobileUnit`) sobre **um retrato da tarefa por job**: sem isso, uma regra reagia à ação da anterior no mesmo job e o laço ramificava (achado no teste do laço).
- Ações pelos services com o ator automação: `notify` (criador, responsável ou time → `notifyFromAutomation` em `notifications.ts`, tipo `automation`, sem N4), `setStatus` (`updateTask`), `moveToActiveCycle` (sem ciclo ativo não faz nada), `moveToTop` (`field_changed` `position`), `addLabel`, `comment` (`{ID}`, `{GLPI}`; autor = primeiro admin ativo, `actor_kind = 'automation'`).
- Falha numa ação para aquela regra, grava `automation_runs` com o erro e segue para as outras. `run_count`/`last_run_at` em toda execução.
- `task.overdue`: job `automation.overdue` às 00:05 (`APP_TIMEZONE`), abertas com prazo ontem. Registrado em `worker/index.ts`.
- CRUD só admin: `listRules`, `saveRule` (status e etiqueta das ações precisam estar ativos), `setRuleEnabled`.

### Templates (`src/server/services/templates.ts`)
- Schemas em `src/lib/validation/templates.ts`: template de tarefa (`taskTemplatePayloadSchema`, agora com `dueInDays`) e de projeto (`tasks[]`, 1 a 30). `parseTaskOutline`/`formatTaskOutline`: o texto da tela (linha = tarefa, "-" = subtarefa).
- `createTask` virou `createTask` + `insertTask(tx, …)`. Com `templateId`, `insertTask` conta o uso (`countTemplateUse`, recusa arquivado) e troca `{UM}` pelo código da primeira UM (`unitTitle`).
- `applyProjectTemplate` cria todas as tarefas numa transação só; falha em qualquer uma desfaz tudo, inclusive o uso.
- `saveTemplate` não muda o tipo na edição; automação e sistema não criam template; membros criam, editam, arquivam e usam.
- `addBusinessDays` (`src/lib/dates.ts`): prazo em dias úteis, sem feriados.

### Telas
- Configurações › Automações (`/config/automacoes`, só admin; aba em `config-ui.tsx`): lista com interruptor, "Quando · Se · Então", execuções e última; diálogo de criar/editar com editor de ações (até 10). `src/server/actions/automations.ts`.
- Templates (`/templates`, item na sidebar): lista + detalhe, editar, arquivar/reativar, usar. Template de tarefa abre a criação rápida pré-preenchida (`openQuickCreate({ templateId })`, prazo calculado); de projeto abre um diálogo que pede Projeto/Cliente e UM. `src/server/actions/templates.ts`.

### Correções feitas no caminho
- `src/server/jobs.ts` (`18ef74a`): o `PgBoss` do processo web vive em `globalThis` e só criava as filas na primeira subida; fila nova ("Queue automation.evaluate does not exist") derrubava toda escrita de tarefa num processo antigo. Agora cria as filas que faltarem.
- `src/lib/utils.ts` (`5f1d030`): o `twMerge` lia `text-small` como cor e apagava `text-on-accent`; botão primário `size="sm"` ficava com contraste 3,22 (axe). Tamanhos do `@theme` registrados.
- `src/server/permissions.ts` (`917c4a0`): `Actor`, `ForbiddenError`, `isAdmin`, `assertAdmin` saíram de `actor.ts` (reexportados lá). Sem isso o worker importava Better Auth e o argon2 nativo via `comments.ts` e o `npm run worker:build` falhava.

## Verificação

| Cenário | Como verificado | Resultado |
|---|---|---|
| Só escrita-gatilho enfileira `automation.evaluate`, na transação, sem retry | `tests/integration/automations.test.ts` | ✅ +1 job ao criar; subtarefa não enfileira; `retry_limit` 0 |
| Concluída com GLPI comenta `#48213 da TI-n`; sem GLPI não roda | idem | ✅ `actor_kind = automation`, 1 run, `run_count` 1 |
| Notificar criador → `automation` com `data.rule`, mesmo sendo o autor | idem | ✅ |
| Atribuir em Backlog → A fazer; evento com `automation_rule_id`; sem ciclo ativo não faz nada | idem | ✅ |
| Urgente vai para o topo da coluna | idem | ✅ |
| Laço Ping/Pong para na profundidade 3 | idem | ✅ 3 runs ok + 1 erro "Cadeia de automações passou de 3" |
| `task.overdue` notifica o responsável | idem | ✅ |
| Etiqueta arquivada: regra falha e grava erro; outra regra roda; salvar recusa | idem | ✅ |
| Membro não lista nem liga/desliga regra | idem | ✅ `ForbiddenError` |
| Template de tarefa: uso contado, `{UM}` → código; arquivado some e recusa | `tests/integration/templates.test.ts` | ✅ |
| Template de projeto: 2 tarefas, subtarefas, prazo útil, uso 1 | idem | ✅ |
| Falha no meio (projeto arquivado) não cria nada nem conta uso; sem projeto recusa | idem | ✅ |
| Tipo não muda na edição; automação não cria template | idem | ✅ |
| Dias úteis; texto do template de projeto ida e volta; `cn` mantém cor | `src/lib/dates.test.ts`, `src/lib/validation/templates.test.ts`, `src/lib/utils.test.ts` | ✅ |
| Automações: 6 regras do seed, liga/desliga, criar regra com 2 ações, axe | `tests/e2e/automations.spec.ts` contra `next build` + `next start -p 3011` | ✅ |
| Templates: criar e usar (tarefa → criação rápida, uso 1), projeto → 2 tarefas na Lista, axe | `tests/e2e/templates.spec.ts`, idem | ✅ isolados; o 4.º login seguido cai no limite de login do build de produção ("Muitas tentativas") |
| Worker com os jobs novos | `npm run worker:build` + `node --env-file=.env dist/worker.mjs` | ✅ "worker: pronto" |
| Suíte | `npm test` | ✅ 20 arquivos, 105 testes |
| Lint, tipos | `npm run lint`, `npm run typecheck` | ✅ 0 erros |

**E2E desktop completo** (build de produção, 1 worker): falham `notifications.spec` "preferências", `shell.spec` "tema claro e escuro… axe" e `tasks.spec` "tarefa inexistente". Os três falham igual no commit `4d366cf` (antes do módulo), conferido num worktree. Os demais `waitForURL` que falham são o limite de login.

## Commits

```
3d37cfb docs: add adr-052 automations and templates
c05f878 feat(automation): add rules engine
257f481 feat(automation): add automations screen
18ef74a fix(jobs): create queues added after the web sender started
5f1d030 fix(ui): keep text color when merging theme font sizes
30eaba6 feat(templates): add templates
917c4a0 fix(worker): import actor helpers without better auth
```

A migração `0011` (no `feat(automation): add rules engine`) já traz `templates.archived_at`, usado no commit dos templates.

## Ficou de fora
- Ciclo: a ação "mover para o ciclo atual" existe, mas não há ciclo ativo até o Módulo 10.
- Histórico de `automation_runs` na tela (só contador e última execução).
- Editor de template sem descrição (o payload aceita `descriptionJson`); template de projeto com prioridade/etiquetas por tarefa só pelo payload, a tela edita título, subtarefas e um prazo comum.
- Feriados no prazo em dias úteis.
- Ferramentas MCP para templates e automações.

## Pontos de atenção
- **Regra 1 do seed × ADR-050:** "Avisar quem criou quando concluir" repete o aviso `status_changed` do N2; nasce desligada (M-053). Bancos já semeados não mudam: desligar na tela.
- **Sem retry (M-053):** `automation.evaluate` e `automation.overdue` vão com `retryLimit: 0` (`NO_RETRY` em `src/server/jobs.ts`; o cron no `worker/index.ts`). Retry repetiria avisos e comentários das regras que já rodaram; em troca, uma falha de banco no meio perde o restante daquele job (fica no log do worker).
- **Dev server antigo:** um `next dev` aberto antes do módulo ficou com `tasks.ts` velho no HMR (`countTemplateUse is not a function`). Reinicie o `npm run dev` depois do pull.
- **Depois do pull:** `npm run db:migrate` (`0011`), `npm run db:seed` (regras) e reiniciar o `npm run worker:dev`.
- **E2E contra `next start`:** `BETTER_AUTH_URL` precisa ser a porta usada, e o limite de login vale; rodar poucos specs por vez ou aguardar 1 minuto.
