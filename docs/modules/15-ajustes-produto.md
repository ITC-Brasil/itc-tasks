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
