# Módulo 04 — Tarefas: núcleo

**Concluído em:** 2026-10-17 · **Branch:** `develop` · **Status:** aprovado e na `main` (PR #4); M-024 e M-026 aplicadas depois, em revisão

ADR-042 escrito antes do código (`ad75ccf`), como pediu a M-018.

## O que foi implementado

### Schema (`src/db/schema/`, migração `drizzle/0005_tasks.sql`, só `CREATE`)

- `enums.ts` — `task_priority`, `actor_kind`, `link_kind`, `cycle_state`, `template_kind`.
- `tasks.ts` — `tasks`, `checklist_items`, `task_links`, `task_labels`, `comments`, `task_events`,
  `attachments`, como no `docs/SCHEMA.md`. Diferença: `position` é `text COLLATE "C"` (custom type
  `position`), para o índice fracionário ordenar por byte e não pela collation do banco.
  `comments` e `attachments` ficam sem tela até o Módulo 06.
- `planning.ts` — `cycles`, `milestones`, `templates` criadas agora, sem tela, para as FKs de
  `tasks` nascerem completas (ADR-042).

### Validação (`src/lib/validation/tasks.ts`)

- `createTaskSchema`: título 1–200; `projectId` ausente ou vazio → `PROJECT_REQUIRED`
  ("Escolha um Projeto/Cliente para criar a tarefa."); GLPI inteiro positivo até 7 dígitos;
  prazo `YYYY-MM-DD`; até 20 etiquetas e 50 subtarefas. Campo opcional vazio (`""`) vira `null`.
- `updateTaskSchema` (parcial: só o que vier muda), `bulkUpdateSchema` (status, responsável,
  prioridade; até 200), `moveTaskSchema`, `taskNumberSchema` (`"TI-142"`, `"142"` ou `142`),
  `linkSchema` (`blocks`, `blocked_by`, `relates`), `taskTemplatePayloadSchema`.

### Service (`src/server/services/tasks.ts`)

- `createTask`, `updateTask`, `moveTask`, `completeTask`, `bulkUpdateTasks`,
  `addChecklistItem`/`updateChecklistItem`/`removeChecklistItem`, `addLink`/`removeLink`,
  `getTaskByNumber`, `listAssignees`, `listTaskTemplates`.
- Tudo em transação; `lockTask` usa `SELECT … FOR UPDATE`. `bulkUpdateTasks` é tudo ou nada.
- Referências: projeto, UM, status, etiqueta inexistentes → `TaskError("NOT_FOUND")`; arquivados →
  `ARCHIVED_REFERENCE`; responsável desativado também. O `code` já prepara o mapeamento do MCP
  (Módulo 07).
- Status padrão: primeiro ativo de `todo`. Entrar em `done` grava `completedAt`, sair limpa
  (`completion()`); `completeTask` vai para o primeiro `done` e é idempotente.
- `task_events`: um evento por mudança (`created`, `status_changed`, `assigned`, `field_changed`,
  `labels_changed`, `checklist_changed`, `link_added`, `link_removed`), ator a partir do `Actor`
  (`actorColumns`). Campo que não mudou não gera evento.
- `docText()` extrai o texto do documento Tiptap para `description_text` (busca do Módulo 06).
- "Bloqueada por" é gravado como `blocks` do outro lado; `getTaskByNumber` devolve o vínculo já
  com o sentido visto pela tarefa.

### Actions (`src/server/actions/tasks.ts`)

`getTaskFormOptionsAction` (só cadastros ativos e templates válidos), `createTaskAction`,
`updateTaskAction`, `addChecklistItemAction`, `updateChecklistItemAction`,
`removeChecklistItemAction`, `setLinkAction`. Devolvem `TaskResult`; `TaskError`, `ForbiddenError`
e `ZodError` viram mensagem.

### Telas e componentes (`src/components/tasks/`)

- `badges.tsx` — `StatusIcon` (forma por categoria: tracejado, vazio, meio, cheio com check),
  `PriorityIcon` (barras de sinal; Urgente quadrado com "!"), `ProjectChip`, `UnitChip`,
  `GlpiChip` (link `GLPI_BASE_URL/front/ticket.form.php?id=N` em nova aba), `LabelChip` (cor só no
  ponto, ADR-041), `glpiUrl()`.
- `fields.tsx` — `Pick`/`PickMany` (Select do Base UI controlado) e `optionItems()`.
- `quick-create.tsx` — `QuickCreate` montado no `AppShell`; abre com `C`, com o botão "Criar
  tarefa" da tela inicial e com "Criar" na barra inferior (< 768 px). Foco no título, `⌘↵`/`Ctrl↵`
  cria, "Criar outra" mantém Projeto/Cliente e UM. Escolher projeto preenche o responsável padrão
  se estiver vazio; UMs filtradas pelo projeto (e as sem projeto). Template só aparece se existir.
  Toast "TI-N criada" com "Abrir".
- `/tarefas/[number]` (`src/app/(app)/tarefas/[number]/page.tsx` + `task-detail.tsx`) — título
  com edição inline (Enter salva, Esc cancela), chips, descrição em Tiptap
  (`description-editor.tsx`, salva ao sair do campo), subtarefas com progresso `1/1`, vínculos por
  tipo, painel de propriedades. Mudanças otimistas com `useOptimistic`; erro desfaz e mostra toast.
  Cadastro arquivado ou pessoa desativada continuam aparecendo no valor atual (`withCurrent`).
- Atalhos `C` e `⌘ ↵` acrescentados ao diálogo `?` (`shortcuts.tsx`).

## Ajustes da revisão (M-022)

ADR-043 escrito antes do código. Decisões do Matheus: responsável padrão e UM × cliente viram regra
do service; qualquer membro/agente edita qualquer tarefa (mantém o ADR-042).

- `createTask`: `assigneeId` omitido recebe `projects.default_assignee_id` (se a pessoa estiver
  ativa); `null` explícito cria sem responsável.
- `assertUnitFits`: UM com cliente só em tarefa desse Projeto/Cliente (`VALIDATION`, "A Unidade
  Móvel UM-07 pertence a outro Projeto/Cliente"); no `update` confere a combinação resultante.
- `setLinkAction`: `taskIdSchema.parse` dentro do `run()`; id inválido vira `{ ok: false }`.
- `creatorFor`: ignora responsável padrão e admins desativados.
- `applyUpdate`: descrição só grava se o documento mudou (`stable()` ordena as chaves, porque o
  `jsonb` não preserva a ordem enviada).
- `moveTask`: reposicionar atualiza `updatedAt`.

| Cenário | Como | Resultado |
|---|---|---|
| Responsável omitido → padrão do projeto; `null` → sem | `tests/integration/tasks.test.ts` | ✅ |
| UM de outro cliente recusada na criação e ao trocar o projeto; UM sem cliente aceita | idem | ✅ |
| Descrição igual (chaves em outra ordem) não grava nem gera evento | idem | ✅ |
| Reordenar no mesmo status muda `updatedAt` | idem | ✅ |
| Vitest completo | `npx vitest run` | ✅ 37 passaram |
| E2E completo | `npx playwright test` | ✅ 18 passaram, 10 pulados |

```
bcc5066 docs: add adr-043 default assignee and unit client rule
c10dfde feat(tasks): apply project default assignee on create
4facef0 feat(tasks): reject mobile unit from another client
aa439bd fix(tasks): handle invalid task id in link action
a53d34e fix(tasks): skip banned users when choosing system creator
9e5cf2a fix(tasks): skip unchanged description on update
2afd8e4 fix(tasks): touch updatedAt when reordering
```

## Cadastros reais e vários Projetos/Clientes por tarefa (M-024, M-026)

Feito depois do merge do PR #4, antes do Módulo 05. ADR-044 e ADR-045 escritos antes do código.

- **Sigla** de 2 a 12 letras ou números (`/^[A-Z0-9]{2,12}$/`); **tipo** `project` ("Projeto")
  acrescentado ao enum (`drizzle/0006_project_kind.sql`, `ALTER TYPE … ADD VALUE`); rótulos
  Projeto/Cliente/Interno em `projects-client.tsx`. **UM exige Projeto/Cliente** no Zod
  (`mobileUnitSchema.projectId`), a coluna segue anulável.
- **Seed** (`src/db/seed.mjs`): BSBIA, SEDET, CODHAB, QDFM, QMPR (Projeto), MOBILITY, INESQ,
  IGEPEX (Cliente), ITC (Interno) e as 12 UMs, com `ON CONFLICT (code) DO NOTHING`. Rodado duas
  vezes no banco de dev: mesmas contagens (BSBIA 4, SEDET 2, CODHAB 1, QDFM 4, QMPR 1).
- **Sem responsável automático:** `createTask` não usa `default_assignee_id`; a criação rápida não
  pré-preenche; o campo saiu da tela e do Zod de Projetos. `creatorFor` usa o primeiro admin ativo.
- **Vários Projetos/Clientes e UMs:** `task_projects` e `task_mobile_units`
  (`drizzle/0007_task_projects_units.sql`, com `INSERT … SELECT` das tarefas existentes — 15/15 no
  dev). `projectIds` (1–10, o primeiro é o principal em `tasks.project_id`) e `mobileUnitIds`
  (até 20). `assertUnitsFit`: UM de projeto não escolhido → "A Unidade Móvel X pertence a outro
  Projeto/Cliente"; remover projeto que ainda tem UM sua → "Remova antes a UM X: ela é do
  Projeto/Cliente Y". Eventos `projects_changed` e `mobile_units_changed` com `{ from, to }`.
  Criação rápida e detalhe com `PickMany` para os dois campos (UMs filtradas pelos projetos) e
  chips de todos.

| Cenário | Como | Resultado |
|---|---|---|
| Sigla longa com dígito aceita; `A-1` recusada; tipo `project` | `tests/integration/catalog.test.ts` | ✅ |
| UM sem Projeto/Cliente recusada | `tests/integration/tasks.test.ts` | ✅ |
| Omitido = sem responsável; criador do sistema é admin ativo | idem | ✅ |
| Sem projeto (lista vazia) recusado na criação e no update | idem | ✅ |
| Dois projetos com UM de cada; principal = primeiro | idem | ✅ |
| UM de projeto não escolhido recusada; remover projeto com UM recusado | idem | ✅ |
| Migração 0007: toda tarefa tem seu `project_id` em `task_projects` | idem | ✅ |
| Criação rápida com BSBIA + SEDET, UMs filtradas (QDFM01 ausente), chips no detalhe | `tests/e2e/tasks.spec.ts` | ✅ |
| UM criada só com Projeto/Cliente | `tests/e2e/catalog.spec.ts` | ✅ |
| Vitest completo / E2E completo | `npx vitest run` / `npx playwright test` | ✅ 38 / 18 passaram |

```
f2dea30 docs: add adr-044 real catalog rules
12362c1 feat(catalog): allow 12-char codes, project kind and required unit client
71c5d9e feat(db): seed real itc projects and mobile units
d07e7ad docs: add adr-045 many projects and units per task
f63e025 refactor(tasks): drop automatic default assignee
c31c002 feat(tasks): support many projects and mobile units per task
```

Ajuste da M-029: o principal (`tasks.project_id`/`mobile_unit_id`) só é recalculado quando a lista vem no patch; `linkedIds()` não tem ordem. Teste: update só do título ou só das UMs mantém o projeto principal.

Ponto de atenção: numa das rodadas paralelas do E2E, o axe em `/config/projetos` acusou violação
uma vez e não repetiu em 4 rodadas seguintes (oscilação sob carga, investigar se voltar).

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Sem Projeto/Cliente: recusado e nada gravado | `tests/integration/tasks.test.ts` | ✅ mensagem `PROJECT_REQUIRED`, `count(tasks)` igual |
| Projeto, UM e etiqueta arquivados recusados | idem | ✅ |
| Cria no primeiro `todo`, GLPI `"48213"` → `48213`, checklist, evento `created` | idem | ✅ |
| `completedAt` ao entrar/sair de `done`; `complete` idempotente | idem | ✅ |
| Um evento por campo alterado; prioridade igual não gera evento | idem | ✅ |
| `move` ordena por posição fracionária (depois de A; topo) | idem | ✅ |
| Bulk tudo ou nada | idem | ✅ |
| Checklist e `blocks` ↔ `blocked_by`; vínculo repetido sem efeito; auto-vínculo recusado | idem | ✅ |
| Integração completa | `npx vitest run` | ✅ 33 passaram (unit + integração) |
| `C` abre focado no título; sem projeto mostra o erro; `Ctrl+Enter` cria; toast → detalhe | `tests/e2e/tasks.spec.ts` | ✅ |
| Link do GLPI `…/front/ticket.form.php?id=48213` | idem | ✅ |
| Subtarefa marcada e título editado persistem após reload | idem | ✅ |
| axe sem violações no detalhe, claro e escuro | idem | ✅ |
| `/tarefas/999999999` → não encontrado | idem | ✅ |
| E2E inteiro (desktop; mobile pulado) | `npx playwright test`, 3 rodadas | ✅ 18 passaram, 10 pulados |
| Tipos e lint | `npm run typecheck`, `npx eslint src` | ✅ sem erro nem aviso |

## Commits

```
ad75ccf docs: add adr-042 tasks core
5af9b1c feat(db): add tasks schema
e8cce78 feat(tasks): add tasks service
19d473b test(tasks): cover core rules
8c10c2f fix(tasks): accept omitted optional task fields
7143a33 feat(tasks): add quick create
14c9f5f feat(tasks): add task detail
c09ec62 test(tasks): cover quick create and task detail e2e
ad9c994 docs: document module 04 tasks core
285948b style(db): format planning schema
6b29b37 test(tasks): use project default assignee as system creator
```

`7143a33` leva também `listTaskTemplates` e os nomes de referência de `getTaskByNumber`
(usados pelo detalhe), que ficaram no mesmo arquivo do service.

## Ficou de fora

- Minhas tarefas, Kanban e Lista (Módulo 05): a tela inicial continua com o empty state; a tarefa
  criada é aberta pelo toast ou pela URL. `moveTask` e `bulkUpdateTasks` têm service e teste, sem
  tela.
- Comentários, histórico na tela, anexos e busca (Módulo 06). `task_events` já é gravado.
- `NOTIFY task_changed` e filas do pg-boss (Módulos 06 e 08).
- Seletores com busca (UI.md §4): `Pick` é Select simples (marcado `ponytail:` em `fields.tsx`).
- Ciclo e marco na criação/detalhe (Módulo 10); tela de templates (Módulo 09).
- Layout mobile do detalhe e da criação (Módulo 11); o E2E das tarefas roda só no desktop.

## Pontos de atenção

- O banco do CI não tem admin: o teste do ator `system` usa um projeto com responsável padrão.

- `position` precisa de `COLLATE "C"`: em `pt_BR`/`en_US` o Postgres ignora maiúsculas e a ordem
  das chaves do `fractional-indexing` quebra.
- O Next enfileira as Server Actions: navegar logo depois de várias edições pode cortar as que ainda
  estavam na fila. O E2E espera a resposta da action do título (filtrando pelo corpo) antes do
  reload.
- O atalho `C` só funciona depois da hidratação; o E2E repete a tecla até o diálogo abrir.
- `tsconfig.tsbuildinfo` velho fez o `tsc` acusar `"/tarefas/[number]"` fora de `AppRoutes` mesmo
  com os tipos de rota gerados; apagar o arquivo resolve.
- Tarefa criada por `automation`/`system` grava como criador o responsável padrão do projeto ou o
  primeiro admin (`creator_id NOT NULL`, ADR-042).
