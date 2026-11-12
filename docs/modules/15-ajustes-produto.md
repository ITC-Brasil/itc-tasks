# Módulo 15 — Ajustes de produto

Cinco itens pedidos pelo Matheus em `PROMPT_MODULO_15.md`, feitos em 12/11/2026 numa sessão sem
supervisão, na `feat/15-ajustes-produto` (merge na `develop` ao fim de cada item).

## Decisões a confirmar

Decididas sem o Matheus, pela opção mais conservadora. Cada uma pode ser revista.

- **Item 1 — rótulos do formulário de UM:** "UM" e "Projeto" também no diálogo de criar e editar. A
  mensagem de validação continua "Escolha o Projeto/Cliente da Unidade Móvel".
- **Item 1 — banco de teste local:** o `itc_tasks_test` da máquina do Matheus tinha 5 UMs com
  `model` preenchido por testes antigos; os valores foram zerados à mão para a migração passar. O
  banco de desenvolvimento e o do CI não tinham dado.
- **Item 2 — ícone e cor do Aguardando:** `Hourglass` do lucide em `warn`, só no ícone (o nome do
  status fica em `text-base`). Alternativa: `CirclePause`, ou cor `info`/`muted`.
- **Item 2 — onde o status é criado:** não no arquivo `.sql`, e sim num passo idempotente depois das
  migrações (`scripts/migrate.mjs` e seed). O prompt pedia o `INSERT` na migração; o Postgres não
  deixa usar o valor novo do enum na transação do `ADD VALUE`, e o Drizzle aplica as migrações
  pendentes numa transação só. O passo põe "Aguardando" antes do primeiro status `done` e desce uma
  posição os status dali em diante (muda só a ordem).
- **Item 2 — importação do Windshift:** o mapa "Aguardando" → `in_progress` ficou como está (a
  importação já foi aplicada).

## Item 1 — Unidades Móveis sem Modelo, Placa e Base (ADR-066)

- **Tela:** Configurações › Unidades Móveis (`src/app/(app)/config/unidades/units-client.tsx`).
  Colunas: UM, Projeto, Situação. Formulário: UM e Projeto.
- **Validação e service:** `mobileUnitSchema` (`src/lib/validation/catalog.ts`) só com `code` e
  `projectId`; `listMobileUnits` não devolve mais os três campos.
- **MCP:** `list_mobile_units` devolve `{ code, project? }`.
- **Banco:** `drizzle/0014_mobile_unit_drop_fields.sql`. Um bloco `DO $$` levanta exceção se qualquer
  UM (ativa ou arquivada) tiver `model`, `plate` ou `base` com valor; só depois os três `DROP COLUMN`.
  Única exceção à regra de migrações só aditivas.
- **Testes:** `tests/integration/db.test.ts` roda o arquivo real da migração sobre uma tabela
  temporária (recusa com dado, remove com tudo vazio); `tests/e2e/catalog.spec.ts` confere os
  cabeçalhos e que os campos sumiram.

## Item 2 — Status e categoria "Aguardando" (ADR-067)

- **Banco:** `drizzle/0015_waiting_status_category.sql` (`ALTER TYPE status_category ADD VALUE
  'waiting' BEFORE 'done'`). O status "Aguardando" nasce no seed (banco novo) ou no passo
  idempotente de `scripts/migrate.mjs` e `src/db/seed.mjs` (banco já semeado).
- **Validação:** `STATUS_CATEGORIES` em `src/lib/validation/catalog.ts`; o filtro `category` do
  `list_tasks` (MCP) usa a mesma lista.
- **Services:** sem mudança. "Aberta" já era "categoria diferente de `done`" (painel, lembretes das
  08:00, automações, MCP `overdue`), e `completed_at` só é preenchido em `done`.
- **UI:** `StatusIcon` (`src/components/tasks/badges.tsx`) com a ampulheta; o Kanban, os filtros e o
  seletor de status leem os status do banco e ganham a coluna e a opção sozinhos; Configurações ›
  Workflow e Automações pela lista `CATEGORIES`; ajuda (`/ajuda`, "Como ler um card").
- **Testes:** `tests/integration/planning.test.ts` (aguardando com prazo vencido conta como aberta
  e vencida, `completedAt` nulo); `tests/e2e/views.spec.ts` (move para Aguardando pelo teclado no
  Kanban, axe nos dois temas, status na Lista).
- **Depois do pull (dev):** `npm run db:migrate` e `npm run db:seed`.
