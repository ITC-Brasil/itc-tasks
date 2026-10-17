# Módulo 03 — Cadastros

**Concluído em:** 2026-10-17 · **Branch:** `develop` · **Status:** ajustes da M-018 aplicados; aguardando o "Módulo 03 aprovado"

## O que foi implementado

### Schema (`src/db/schema/`)

- `enums.ts` — `status_category` (`backlog`, `todo`, `in_progress`, `done`) e `project_kind`
  (`client`, `internal`). Os demais enums do `docs/SCHEMA.md` entram com as tabelas que os usam.
- `catalog.ts` — `projects`, `mobile_units`, `workflow_statuses`, `labels`, como no SCHEMA.md,
  com `archivedAt` (ADR-018) e os índices únicos `projects_code_uq`, `mobile_units_code_uq`,
  `labels_name_uq`.
- Migração `drizzle/0003_catalog.sql` (só `CREATE`).

### Seed (`src/db/seed.mjs`, idempotente)

- Status Backlog, A fazer, Em andamento, Concluído (posições 1–4), só com a tabela vazia, para não
  desfazer o que o admin mudou.
- Etiquetas rede (`label-blue`), hardware (`label-plum`), segurança (`label-rose`), campo
  (`label-teal`), só com a tabela vazia: renomear "rede" não faz o seed recriá-la.
- Projeto "A classificar" (`ACL`, interno) para a migração do Windshift.

### Service e actions

- `src/lib/validation/catalog.ts` — `projectSchema`, `mobileUnitSchema`, `labelSchema`,
  `statusSchema`, `statusNameSchema`, `catalogIdSchema`; campos opcionais vazios viram `null`.
- `src/server/services/catalog.ts` — `CatalogError`; `list*` (qualquer actor, `includeArchived`
  opcional); `create*`, `update*` e `set*Archived` para projetos, UMs e etiquetas; `createStatus`,
  `renameStatus`, `setStatusArchived` e `moveStatus`. Regras no ADR-040.
- `src/server/actions/catalog.ts` — actions finas: Zod, service, `revalidatePath` da tela e erros
  para `ActionResult`.

### Telas (`src/app/(app)/config/`, só admin)

- `admin-only.tsx` — `AdminConfigPage`: confere o admin e monta Topbar, abas e conteúdo. Membros
  passou a usá-la.
- `config-ui.tsx` — `ConfigTabs` (Projetos/Clientes, Unidades Móveis, Workflow, Etiquetas,
  Membros), `FormDialog` (criar/editar com erro inline), `FormSelect`, `ArchiveButton`, `useRun`.
- `/config/projetos` — sigla, nome, tipo, responsável padrão (membros ativos), entidade no GLPI.
- `/config/unidades` — código, modelo, placa, base e cliente (só ativos no seletor; o cliente atual
  arquivado aparece com "(arquivado)").
- `/config/workflow` — ordem por subir/descer, renomear, arquivar; categoria só na criação.
- `/config/etiquetas` — nome e cor da paleta própria do ADR-041 (`label-teal`, `label-blue`,
  `label-plum`, `label-rose`, `label-olive`, `label-brown`, `label-slate`, em
  `src/styles/globals.css`). A cor aparece só como ponto de fundo, nunca como texto.
- Migração `drizzle/0004_label_palette.sql` — `UPDATE` que só renomeia os tokens antigos
  (`info`→`label-blue`, `sev-medium`→`label-plum`, `bordo`→`label-rose`, `accent`→`label-teal`,
  `ok`→`label-olive`, `warn`→`label-brown`); exceção registrada no ADR-041.
- `src/components/layout/nav.ts` — "Configurações" aponta para `/config/projetos`.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Sigla única sem diferenciar caixa; "A1" recusada | `tests/integration/catalog.test.ts` | ✅ |
| Etiqueta recusa cor funcional; nenhum token antigo depois da 0004 | `tests/integration/catalog.test.ts` | ✅ |
| Member não cria etiqueta nem status | idem | ✅ `ForbiddenError` |
| Arquivado some de `list*` e volta ao reativar | idem | ✅ |
| UM recusa cliente arquivado novo e mantém o atual | idem | ✅ |
| Último status `done` ativo não arquiva; subir troca com o vizinho | idem | ✅ |
| Quatro telas sem violações do axe | `tests/e2e/catalog.spec.ts` | ✅ |
| Criar projeto pela tela, sigla repetida mostra erro, arquivar e reativar | idem | ✅ |
| Criar UM sem cliente (Select com valor vazio) | idem | ✅ |
| Seed rodado duas vezes | `npm run db:seed` duas vezes | ✅ 4 status, 4 etiquetas, 1 projeto |

Local, depois da M-018: integração 20 passaram; E2E de cadastros 3 passaram. Antes: `npm test` 22 passaram; `npx playwright test` 16 passaram e 8 foram pulados (mobile);
`lint` e `typecheck` limpos.

## Commits

```
c612111 feat(db): add catalog schema
ea67c64 feat(catalog): add catalog service
4ef5559 feat(catalog): add projects and mobile units screens
87af4e4 feat(settings): add workflow and labels
d3e8634 test(catalog): cover archiving rules
dab4b00 docs: document module 03 catalog
e16a128 docs: note module 02 merged into main
07a2b9e docs: add adr-041 label palette
8c27611 feat(catalog): add own label palette
b3a2f54 fix(db): seed labels only into an empty table
```

## Ficou de fora

- Contagem de tarefas abertas por UM (PRD C2): depende de `tasks`, Módulo 04.
- Recusa `ARCHIVED_REFERENCE` ao criar ou editar tarefa: Módulos 04 (`tasksService`) e 07 (MCP).
- Telas de cadastro no mobile: Módulo 11. O E2E roda só no desktop.

## Pontos de atenção

- O ADR-040 foi escrito no fechamento, não antes do código (aceito na M-018); a partir do Módulo 04 o ADR vem antes.
- Os E2E criam projetos e UMs "E2E …" no banco de dev, que não são excluídos (ADR-018).
- `moveStatus` ignora arquivados; reativar um status o devolve à posição antiga.
