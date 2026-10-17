# Módulo 07 — Servidor MCP

**Status:** pronto para revisão em 17/10/2026, na `develop`. ADR-049 escrito antes do código.

PRD M1 (servidor `/mcp` com as ferramentas de `docs/API.md`), M2 (tokens com nome, dono e permissões, exibidos uma vez, revogáveis) e M3 (ações de agente no histórico com o token — o selo "via MCP" já existia desde o Módulo 06).

## O que foi implementado

### Schema
Sem migração. A tabela `apikey` do plugin `@better-auth/api-key` existe desde `0001_auth`; `task_events.api_key_id` e `comments.api_key_id` desde `0005_tasks`.

### Services
- `src/server/services/agents.ts` (`agentsService`):
  - `agentFromKey(key)` — `auth.api.verifyApiKey({ body: { key } })`; inválido, desativado, expirado ou dono banido → `{ status: 401 }`; `error.code === "RATE_LIMITED"` → `{ status: 429 }`. Válido → `Actor { kind: "agent", userId, role, apiKeyId }` + `access` tirado de `permissions.tasks` (`"read"`, `"write"`).
  - `createAgentKey(actor, { name, access, userId? })` — `auth.api.createApiKey` no servidor com `permissions: { tasks: ["read"] }` ou `["read", "write"]`; devolve `{ id, key }` (o segredo só aqui). Membro só para si; admin para qualquer pessoa.
  - `revokeAgentKey` — `enabled = false`, sem excluir (o histórico aponta para o token). `listAgentKeys` (membro: os próprios; admin: todos) e `listAgentActivity` (últimos 20 `task_events` com `api_key_id`).
  - Tradução do contrato: códigos de projeto/UM sem diferenciar maiúsculas, nomes de status/etiqueta (ativo primeiro), pessoa por e-mail ou `me`; `markdownToDoc` (parágrafos, `hardBreak`, `@email` de pessoa ativa → nó `mention`); `getTaskSummary`/`getTaskDetail` (descrição e comentários como texto via `docText`, últimos 20 comentários); `listTasksForAgent` sobre `listTasks` com `query`/`category`/`dueBefore`/`overdue` em memória, ordem `number desc`, `cursor` = último número; `listCyclesForAgent` (`done`/`total` por ciclo).
- `src/lib/validation/agents.ts` — `createAgentKeySchema` e os shapes Zod das ferramentas (`mcpListTasks`, `mcpCreateTask`, `mcpUpdateTask`, …). `projectIds` é opcional no shape para o `createTaskSchema` responder `VALIDATION` com "Escolha um Projeto/Cliente para criar a tarefa.".

### Rotas e actions
- `src/app/mcp/route.ts` — `POST`: Bearer → `agentFromKey` → `createMcpServer` + `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`; 401 sem token ou inválido; 429 com `Retry-After: 60`. `GET`/`DELETE` → 405. Sem `export const dynamic` (incompatível com `cacheComponents`, ADR-036).
- `src/server/mcp.ts` — `createMcpServer(actor, access)`: 9 ferramentas (`list_tasks`, `get_task`, `list_projects`, `list_mobile_units`, `list_cycles`, `create_task`, `update_task`, `complete_task`, `add_comment`), `serverInfo { name: "itc-tasks", version: "1.0.0" }`, `annotations.readOnlyHint`. Sem a permissão → `FORBIDDEN`. `TaskError` → seu `code` (`TOO_LARGE`/`UNSUPPORTED_TYPE` → `VALIDATION`); `ZodError` → `VALIDATION`; `ForbiddenError` → `FORBIDDEN`. O `createToolError` interno do SDK é trocado (`Reflect.set`) para a falha de schema também sair como `{ code: "VALIDATION" }`; erro inesperado → `INTERNAL`.
- `src/server/actions/agents.ts` — `createApiKeyAction(form)` (devolve `key`) e `revokeApiKeyAction(keyId)`; revalidam `/config/agentes`.
- `src/proxy.ts` já excluía `/mcp` do redirecionamento para `/login`.

### Telas e componentes
- `src/app/(app)/config/agentes/page.tsx` + `agents-client.tsx` — Configurações › Agentes e MCP: tabela (nome + início do token, dono para admin, permissões, último uso com contagem de requisições, Ativo/Revogado, Revogar), EmptyState "Nenhum agente conectado" (UI.md), diálogo "Novo token" (nome, permissões, dono para admin) que vira "Token criado — Copie agora: ele não será mostrado de novo." com botão copiar; atividade recente; exemplo de configuração do cliente MCP.
- `src/app/(app)/config/admin-only.tsx` — `AdminConfigPage` ganhou `members` (abre a tela para membros, sem as abas de admin). Aba "Agentes e MCP" em `config-ui.tsx`.
- `src/components/layout/nav.ts` — item `memberOnly` "Agentes e MCP" (ícone `Bot`) para quem não é admin; `app-shell.tsx` filtra `adminOnly`/`memberOnly`.

## Verificação

| Cenário | Como verificado | Resultado |
|---|---|---|
| Sem token / token inexistente | `tests/integration/mcp.test.ts` | ✅ 401 |
| `create_task` sem projeto | idem | ✅ `isError`, `{ code: "VALIDATION", message: "Escolha um Projeto/Cliente para criar a tarefa." }` |
| Tipo errado (`title: 42`) barrado pelo SDK | idem | ✅ `code: "VALIDATION"` |
| Criar por códigos (projeto em minúsculas, UM, `me`, markdown com `@email`, checklist, GLPI), ler, `update_task` com `checklistToggle`, `list_tasks` por `#48213`, comentar, concluir duas vezes | idem | ✅ resumo e detalhe corretos; `complete_task` idempotente; eventos e comentários com `actor_kind = 'agent'` e `api_key_id` do token |
| Token só-leitura em `create_task` | idem | ✅ `FORBIDDEN` |
| Projeto inexistente | idem | ✅ `NOT_FOUND` |
| Token revogado | idem | ✅ 200 antes, 401 depois; listado como desativado |
| Membro cria token para outra pessoa / revoga o de outra | idem | ✅ recusado |
| 61 chamadas em 1 min no mesmo token | idem | ✅ 60 × 200, a 61ª 429 |
| Tela: criar só-leitura, segredo uma vez, `/mcp` 200, revogar, `/mcp` 401, axe, sem erro de hidratação | `tests/e2e/agents.spec.ts` (desktop), contra `next dev` e contra `next build` + `next start` | ✅ |
| Suíte | `npm test` | ✅ 15 arquivos, 72 testes |
| Lint e tipos | `npm run lint`, `npm run typecheck` | ✅ 0 erros (2 avisos antigos em `tests/`) |

## Commits

```
2110d5c docs: add adr-049 mcp server
ec74e9f feat(mcp): add mcp server and task tools
1ca69a4 fix(mcp): drop dynamic segment config incompatible with cache components
d9c7647 feat(settings): add agents screen
8ed5f81 test(mcp): cover permissions and validation
```

As duas primeiras tarefas do módulo (servidor e ferramentas) saíram num só commit: a rota não tem o que servir sem as ferramentas.

## Ficou de fora
- `cycle` em `create_task`/`update_task` e no filtro de `list_tasks` — com o service de ciclos (Módulo 10). `list_cycles` já funciona.
- `list_tasks.query` procura no título e no `#GLPI`, não na descrição (ADR-049).
- `update_task` grava campos, itens novos de checklist e toggles em transações separadas (cada uma com seu evento).

## Pontos de atenção
- **`createToolError` do SDK:** detalhe privado do `@modelcontextprotocol/sdk` 1.32.1. O teste "erro de schema do SDK também volta como VALIDATION" quebra se uma atualização mudar isso.
- **Rate limit no banco:** cada chamada faz `verifyApiKey`, que grava `request_count`/`last_request` na `apikey`.
- **Hidratação nas abas de Configurações:** um `next dev` aberto antes da mudança em `config-ui.tsx` mostrou erro de hidratação na aba nova; o build de produção não mostra (o E2E confere). Se aparecer, reiniciar o `next dev`.
- **Cloudflare Access:** se for ligado na frente do app, `/mcp` precisa de bypass (ADR-009).
