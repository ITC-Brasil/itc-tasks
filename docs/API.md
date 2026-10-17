# ITC Tasks — API e contrato do MCP

> Estado: **planejado** (17/10/2026). O contrato do MCP é tratado como API pública
> (ADR-009): mudanças incompatíveis exigem ADR e nova versão do servidor (`serverInfo.version`).

A interface usa **Server Actions** (`src/server/actions/`) e não expõe REST para CRUD. As rotas
HTTP existem só onde é preciso: auth, MCP, tempo real, push, anexos e saúde.

---

## 1. Servidor MCP

### POST /mcp (e GET /mcp para o stream do Streamable HTTP)
Auth: `Authorization: Bearer <token>` — API key do Better Auth (plugin `apiKey`).
Transporte: Streamable HTTP, `@modelcontextprotocol/sdk` 1.32.1.
`serverInfo`: `{ name: "itc-tasks", version: "1.0.0" }`.
Response 401: token ausente, inválido, expirado ou revogado.
Response 429: mais de 60 requisições/min no mesmo token.

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
  project?: string;               // código, ex. "TRL"
  mobileUnit?: string;            // "UM-07"
  assignee?: string | 'me' | 'none';
  cycle?: 'current' | number;
  dueBefore?: string;             // YYYY-MM-DD
  overdue?: boolean;
  limit?: number;                 // 1–100, padrão 25
  cursor?: string;
}
output: { tasks: TaskSummary[]; nextCursor?: string }
TaskSummary = { id: "TI-142", title, status, category, priority, project: "TRL",
                mobileUnit?: "UM-07", glpiTicket?: 48213, assignee?: email,
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
  project: string;                // OBRIGATÓRIO, código ativo
  description?: string;           // markdown → Tiptap JSON
  status?: string;                // padrão: primeiro status de categoria 'todo'
  priority?: 'none'|'low'|'medium'|'high'|'urgent';
  assignee?: string | 'me';
  mobileUnit?: string;
  glpiTicket?: number;            // inteiro positivo, até 7 dígitos
  dueDate?: string;               // YYYY-MM-DD
  cycle?: 'current' | number;
  labels?: string[];
  checklist?: string[];
}
output: TaskSummary
```
Erro esperado sem `project`: `VALIDATION` — "Escolha um Projeto/Cliente para criar a tarefa."

#### `update_task`
```ts
input: { id: string | number } & Partial<Omit<CreateTaskInput, never>> & {
  checklistToggle?: { index: number; done: boolean }[];
}
output: TaskSummary
```
Só os campos enviados mudam. `project: null` é recusado (`VALIDATION`).

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
Cadastro público desligado (`disableSignUp: true`). Rate limit do Better Auth ativo.

---

## 3. Tempo real

### GET /api/events
Auth: sessão ativa.
Response 200: `text/event-stream`. Eventos:
- `task.changed` — `{ id, number, fields: string[] }`
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
Response 201: `{ id, fileName, sizeBytes }` · 413: acima de 25 MB · 415: tipo não permitido.

### GET /api/attachments/[id]
Auth: sessão ativa. Response 200: o arquivo com `Content-Disposition: attachment` · 404.

---

## 6. Saúde

### GET /api/health
Auth: pública. Response 200: `{ db: "ok", queue: "ok", version }` · 503 se o banco ou a fila falharem.

---

## 7. Server Actions (referência)

Não são rotas públicas; listadas para mapear UI → service.

| Action (`src/server/actions/`) | Service |
|---|---|
| `createTaskAction`, `updateTaskAction`, `moveTaskAction`, `completeTaskAction`, `bulkUpdateTasksAction` | `tasksService` |
| `toggleChecklistItemAction`, `addChecklistItemAction` | `tasksService` |
| `addCommentAction` | `commentsService` |
| `createProjectAction`, `archiveProjectAction`, `createMobileUnitAction`, `archiveMobileUnitAction` | `catalogService` |
| `startCycleAction`, `closeCycleAction`, `createMilestoneAction` | `planningService` |
| `saveAutomationRuleAction`, `toggleAutomationRuleAction` | `automationService` |
| `markNotificationsReadAction`, `updateNotificationPreferencesAction` | `notificationsService` |
| `createApiKeyAction`, `revokeApiKeyAction` | Better Auth `apiKey` + `agentsService` |
| `updateUserPreferencesAction` (tema, sidebar) | `usersService` |
