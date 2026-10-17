# ITC Tasks — API e contrato do MCP

> Estado: MCP **implementado** no Módulo 07 (17/10/2026, ADR-049). O contrato do MCP é tratado como API pública
> (ADR-009): mudanças incompatíveis exigem ADR e nova versão do servidor (`serverInfo.version`).

A interface usa **Server Actions** (`src/server/actions/`) e não expõe REST para CRUD. As rotas
HTTP existem só onde é preciso: auth, MCP, tempo real, push, anexos e saúde.

---

## 1. Servidor MCP

### POST /mcp
Transporte sem sessão (ADR-049): `GET` e `DELETE /mcp` → 405.
Auth: `Authorization: Bearer <token>` — API key do Better Auth (plugin `apiKey`).
Transporte: Streamable HTTP, `@modelcontextprotocol/sdk` 1.32.1.
`serverInfo`: `{ name: "itc-tasks", version: "1.0.0" }`.
Response 401: token ausente, inválido, expirado ou revogado.
Response 429: mais de 60 requisições/min no mesmo token (`Retry-After: 60`).
Token: `permissions = { tasks: ["read"] }` ou `{ tasks: ["read", "write"] }`; revogar = `enabled = false`.

**Diferenças da implementação (Módulo 07):** `cycle` em `list_tasks`, `create_task` e `update_task` ainda não existe (Módulo 10); `query` de `list_tasks` procura no título e no `#GLPI`; erro inesperado sai como `code: "INTERNAL"`; `update_task` aceita `checklist` (acrescenta itens).

**Regras comuns a todas as ferramentas**
- O agente age **em nome do dono do token**; histórico registra `actorKind = 'agent'` e `apiKeyId`.
- Input validado pelos mesmos schemas Zod da UI (`src/lib/validation/`).
- Tarefas são identificadas por `id` aceitando `"TI-142"`, `"142"` ou `142`.
- Cadastros arquivados não aparecem em `list_*` e são recusados em escrita.
- Erros voltam como resultado `isError: true` com `structuredContent: { code, message }`.

| `code` | Quando |
|---|---|
| `VALIDATION` | Input fora do schema (ex.: sem `project`) |
| `NOT_FOUND` | Tarefa, projeto, UM, ciclo ou usuário inexistente |
| `FORBIDDEN` | Token sem a permissão exigida |
| `ARCHIVED_REFERENCE` | Projeto/Cliente, UM, status ou etiqueta arquivados |
| `CONFLICT` | Estado incompatível (ex.: concluir tarefa já concluída — idempotente devolve a tarefa, sem erro) |

Projetos, UMs, status e pessoas podem ser referenciados por **código legível**:
`project: "TRL"`, `mobileUnit: "UM-07"`, `status: "Em andamento"`, `assignee: "matheus@grupoitcbrasil.com.br"`.

### Ferramentas de leitura — permissão `tasks:read`

#### `list_tasks`
```ts
input: {
  query?: string;                 // busca em título/descrição; "#48213" busca por GLPI
  status?: string[];              // nomes de status
  category?: ('backlog'|'todo'|'in_progress'|'done')[];
  project?: string;               // código, ex. "TRL"; casa com qualquer projeto da tarefa (task_projects)
  mobileUnit?: string;            // "UM-07"; casa com qualquer UM da tarefa (task_mobile_units)
  assignee?: string | 'me' | 'none';
  cycle?: 'current' | number;
  dueBefore?: string;             // YYYY-MM-DD
  overdue?: boolean;
  limit?: number;                 // 1–100, padrão 25
  cursor?: string;
}
output: { tasks: TaskSummary[]; nextCursor?: string }
TaskSummary = { id: "TI-142", title, status, category, priority, projects: ["TRL"],
                mobileUnits: ["UM-07"], glpiTicket?: 48213, assignee?: email,
                dueDate?: "2026-10-16", url }
```

#### `get_task`
```ts
input:  { id: string | number }
output: TaskSummary & { description: string /* markdown */, checklist: { text, done, assignee? }[],
         links: { kind: 'blocks'|'blocked_by'|'relates', id }[], labels: string[],
         comments: { author, viaAgent: boolean, body, createdAt }[] /* últimos 20 */,
         glpiUrl?: string, createdAt, updatedAt, completedAt? }
```

#### `list_projects`
`input: {}` → `output: { projects: { code, name, kind }[] }` — só ativos.

#### `list_mobile_units`
`input: { project?: string }` → `output: { mobileUnits: { code, model?, plate?, base?, project? }[] }` — só ativas.

#### `list_cycles`
`input: { state?: 'planned'|'active'|'closed' }` → `output: { cycles: { number, startsOn, endsOn, state, done, total }[] }`

### Ferramentas de escrita — permissão `tasks:write`

#### `create_task`
```ts
input: {
  title: string;                  // 1–200
  projectIds: string[];           // OBRIGATÓRIO, 1–10 códigos ativos; o primeiro é o principal (ADR-045)
  description?: string;           // markdown → Tiptap JSON
  status?: string;                // padrão: primeiro status de categoria 'todo'
  priority?: 'none'|'low'|'medium'|'high'|'urgent';
  assignee?: string | 'me';
  mobileUnitIds?: string[];       // até 20; cada UM de um dos projetos da tarefa
  glpiTicket?: number;            // inteiro positivo, até 7 dígitos
  dueDate?: string;               // YYYY-MM-DD
  cycle?: 'current' | number;
  labels?: string[];
  checklist?: string[];
}
output: TaskSummary
```
Erro esperado sem `projectIds` (ou lista vazia): `VALIDATION` — "Escolha um Projeto/Cliente para criar a tarefa."

#### `update_task`
```ts
input: { id: string | number } & Partial<Omit<CreateTaskInput, never>> & {
  checklistToggle?: { index: number; done: boolean }[];
}
output: TaskSummary
```
Só os campos enviados mudam. `projectIds: []` é recusado (`VALIDATION`); UM de projeto que não está na tarefa e remoção de projeto que ainda tem UM sua na tarefa também (ADR-045).

#### `complete_task`
`input: { id, comment?: string }` → move para o primeiro status de categoria `done`; idempotente.
`output: TaskSummary`

#### `add_comment`
`input: { id, body: string /* markdown, aceita @email */ }` → `output: { commentId, createdAt }`

### Exemplo de configuração no cliente MCP

```json
{
  "mcpServers": {
    "itc-tasks": {
      "type": "http",
      "url": "https://tasks.itcbr.xyz/mcp",
      "headers": { "Authorization": "Bearer itct_..." }
    }
  }
}
```

---

## 2. Autenticação

### [GET, POST] /api/auth/[...all]
Auth: pública (rotas do Better Auth: `sign-in/email`, `sign-out`, `get-session`, `admin/*`, `api-key/*`).
Cadastro público desligado (`disableSignUp: true`, `sign-up/email` → 400). Rate limit do Better Auth ativo.
Login: `POST /api/auth/sign-in/email` `{ email, password }` → 200 com cookie de sessão · 401 `INVALID_EMAIL_OR_PASSWORD` · 403 `BANNED_USER` (membro desativado) · 429.
Handler: `src/app/api/auth/[...all]/route.ts`.

---

## 3. Tempo real

### GET /api/events
Auth: sessão ativa.
Response 200: `text/event-stream`. Eventos:
- `task.changed` — `{ id, number, fields: string[], by: string | null }` (`fields` = tipos de `task_events` da escrita; `by` = pessoa que escreveu, só para ator `user`; agente/automação/sistema → `null`). Implementado no Módulo 06 (`src/app/api/events/route.ts`); `notification.created` entra no Módulo 08.
- `notification.created` — `{ id, event, unreadCount }`
- `ping` — a cada 25 s (heartbeat por causa do túnel, ADR-020)

---

## 4. Push

### POST /api/push/subscribe
Auth: sessão ativa.
Body: `{ endpoint: string, keys: { p256dh: string, auth: string }, userAgent?: string }`
Response 201: `{ id }` · Response 400: assinatura inválida.

### DELETE /api/push/subscribe
Auth: sessão ativa. Body: `{ endpoint: string }` · Response 204.

### POST /api/push/test
Auth: sessão ativa. Envia uma notificação de teste para as assinaturas do usuário. Response 202.

---

## 5. Anexos

### POST /api/attachments
Auth: sessão ativa. Body: `multipart/form-data` com `taskId` e `file` (≤ 25 MB).
Response 201: `{ id, fileName, sizeBytes }` · 411: sem `Content-Length` · 413: acima de 25 MB · 415: tipo não permitido.

### GET /api/attachments/[id]
Auth: sessão ativa. Response 200: o arquivo com `Content-Disposition: attachment` · 404.

Implementado no Módulo 06 (`src/app/api/attachments/`): 401 sem sessão; 400 tarefa inválida ou arquivo ausente; tipo pela extensão (lista em `src/server/services/attachments.ts`); download com `X-Content-Type-Options: nosniff`.

---

## 6. Saúde

### GET /api/health
Auth: pública. Response 200: `{ db: "ok", queue: "ok", version }` · 503 se o banco ou a fila falharem.
Implementado no Módulo 00 (`src/app/api/health/route.ts`) sem `queue`: 200 `{ db: "ok", version }`, 503 `{ db: "down", version }`. `queue` entra com o pg-boss no Módulo 08.

---

## 7. Server Actions (referência)

Não são rotas públicas; listadas para mapear UI → service.

| Action (`src/server/actions/`) | Service |
|---|---|
| `createTaskAction`, `updateTaskAction`, `moveTaskAction`, `completeTaskAction`, `bulkUpdateTasksAction` | `tasksService` |
| `getTaskFormOptionsAction`, `addChecklistItemAction`, `updateChecklistItemAction`, `removeChecklistItemAction`, `setLinkAction` | `tasksService` (Módulo 04; `moveTaskAction`, `completeTaskAction` e `bulkUpdateTasksAction` entram com as telas do Módulo 05) |
| `addCommentAction`, `editCommentAction` (`src/server/actions/tasks.ts`) | `src/server/services/comments.ts` |
| `searchTasksAction` | `searchTasks` em `src/server/services/tasks.ts` |
| `createProjectAction`, `archiveProjectAction`, `createMobileUnitAction`, `archiveMobileUnitAction` | `catalogService` |
| `startCycleAction`, `closeCycleAction`, `createMilestoneAction` | `planningService` |
| `saveAutomationRuleAction`, `toggleAutomationRuleAction` | `automationService` |
| `markNotificationsReadAction`, `updateNotificationPreferencesAction` | `notificationsService` |
| `createApiKeyAction`, `revokeApiKeyAction` (`src/server/actions/agents.ts`) | `agentsService` (`src/server/services/agents.ts`) sobre o Better Auth `apiKey` |
| `updateUserPreferencesAction` (tema, sidebar) | `usersService` |
| `createMemberAction`, `setMemberRoleAction`, `setMemberActiveAction` (`src/server/actions/members.ts`) | `membersService` (`src/server/services/members.ts`) |
