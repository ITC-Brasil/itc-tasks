# Módulo 06 — Comentários, histórico, anexos e busca

**Status:** aprovado com ajustes na M-039; ajustes feitos em 17/10/2026, na `develop`. ADR-048 escrito antes do código.

PRD T1 (anexos), T5 (comentários com @menção e histórico), V1 (aba Menções) e V6 (busca ⌘K), mais o tempo real do ADR-020.

## O que foi implementado

### Schema
Sem migração: `comments` e `attachments` já existiam desde `drizzle/0005_tasks.sql`; o índice GIN `tasks_search_idx` sobre `tasks.search` (tsvector com `unaccent_immutable`) também.

### Services
- `src/server/services/comments.ts` — `addComment`, `editComment` (só o autor; senão `ForbiddenError`), `listComments`, `mentionIds`. O corpo é o JSON do Tiptap (`commentBodySchema` em `src/lib/validation/tasks.ts`); `bodyText` sai do `docText` (que agora escreve `@Nome` para nós `mention`). `mentions` guarda só IDs de pessoas ativas (conferidos no banco). Vazio → "Escreva o comentário"; mais de 10 000 caracteres → recusado. Sem exclusão.
- `src/server/services/activity.ts` — `listActivity(taskId)`: `task_events` + nome do ator + nome do token (agente); `describe()` formata o payload do ADR-042 com os nomes atuais ("mudou o status de A fazer para Em andamento", "definiu o prazo para 20/10/2026", "etiquetas: adicionou X; removeu Y"). `commented`/`comment_edited` não viram linha: o comentário aparece no lugar. Ator `automation` → "Automação", `system` → "Sistema".
- `src/server/services/attachments.ts` — `addAttachment`, `getAttachment`, `listAttachments`, `cleanFileName`, `mimeFor`. `MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024`. O tipo vem da extensão (21 extensões: imagens, PDF, txt/log/csv, json/xml, zip/7z, Office e ODF), nunca do navegador. Grava em `UPLOADS_DIR/<uuid>` antes da transação e apaga o arquivo se a transação falhar.
- `src/server/services/tasks.ts`:
  - `record()` agora faz `pg_notify('task_changed', { id, number, fields, by })` (`by` = `userId` só quando o ator é `user`; agente, automação e sistema mandam `null`, para a tela do dono do token atualizar com o que o agente dele faz — M-039) na mesma transação — o Postgres só entrega no commit.
  - Tipos novos de `task_events`: `commented`, `comment_edited`, `attachment_added` (payloads `{ commentId }` e `{ attachmentId, fileName }`).
  - `TaskErrorCode` ganhou `TOO_LARGE` e `UNSUPPORTED_TYPE`.
  - `listTasks` aceita `scope.mentionedUserId` (`comments.mentions @> ARRAY[id]`).
  - `searchTasks(actor, q)` e `prefixQuery(q)`: `TI-142`/`142` → `number`; `#48213` → `glpi_ticket`; código de UM com ou sem `UM-` → `ILIKE 'cod%'` (com `%`, `_` e `\` escapados) em `task_mobile_units`; texto → `to_tsquery('portuguese', unaccent_immutable('termo:* & …'))`. Abertas antes de concluídas, depois `ts_rank`; até 20. Sem nenhum critério válido devolve `[]`.
- `src/server/realtime.ts` — um cliente `pg` dedicado com `LISTEN task_changed` por processo (guardado em `globalThis` por causa do HMR), repassado a todos os assinantes; reconecta em 5 s se cair e ainda houver aba ouvindo.
- `src/server/actor.ts` — `sessionActor()`: para rotas de API, devolve o `Actor` ou `null` (401), sem redirecionar.

### Rotas e actions
- `POST /api/attachments` (`src/app/api/attachments/route.ts`) — 401 sem sessão; 411 sem `Content-Length` numérico (envio chunked seria lido inteiro na memória pelo `formData()`) e 413 acima de 25 MB + 64 KB, as duas checagens antes de ler o corpo (`declaredSizeStatus` em `src/server/services/attachments.ts`, M-039); ou pelo tamanho do arquivo; 415 tipo fora da lista; 400 tarefa inválida; 201 `{ id, fileName, sizeBytes }`.
- `GET /api/attachments/[id]` — stream do arquivo com `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`; 404 se a linha ou o arquivo não existir.
- `GET /api/events` (`src/app/api/events/route.ts`) — `text/event-stream`, `retry: 5000`, `event: task.changed`, `event: ping` a cada 25 s, `X-Accel-Buffering: no`; limpa a assinatura no `abort`.
- `src/server/actions/tasks.ts`: `addCommentAction`, `editCommentAction`, `searchTasksAction`.

### Telas e componentes
- `src/components/tasks/comment-editor.tsx` — `CommentEditor` (Tiptap + `@tiptap/extension-mention` 3.32.0 e `@tiptap/suggestion` 3.32.0; lista de pessoas com setas, Enter/Tab, Esc; ⌘/Ctrl+Enter envia) e `CommentBody` (só leitura).
- `src/components/tasks/task-detail.tsx` — seção **Anexos** (botão "Anexar arquivo", vários de uma vez, aviso no cliente acima de 25 MB, link de download, tamanho, quem e quando) e seção **Atividade**: comentários e eventos numa linha do tempo, mais recente embaixo, "via MCP · <token>" para agente, "(editado)" e "Editar" no próprio comentário.
- `src/app/(app)/page.tsx` — aba **Menções** (`?aba=mencoes`).
- `src/components/layout/command-palette.tsx` — `cmdk` 1.1.1 no `Dialog` do DS: grupo Tarefas (StatusIcon, `TI-n`, título, `#GLPI`) com debounce de 150 ms e grupo Ações (Criar tarefa, telas da navegação, Lista, Calendário). ⌘K/Ctrl+K abre e fecha; entrada nova no diálogo de atalhos.
- `src/components/layout/live-refresh.tsx` — `EventSource("/api/events")` no `AppShell`; `task.changed` → `router.refresh()` com debounce de 500 ms. Ignora eventos da própria pessoa (`by` no payload = `profile.id`; a action já revalida) e adia em intervalos de 1 s enquanto há botão do mouse pressionado, foco em campo de texto/editor ou `dialog`/`listbox` aberto — senão o refresh desfaz um arrasto no Kanban.
- `src/lib/dates.ts` — `relativeTime` ("agora", "há 5 minutos", "ontem"; depois de 7 dias, a data).

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Comentário com menção grava `mentions`, evento `commented` e entra na aba Menções só de quem foi citado | `tests/integration/comments.test.ts` | ✅ |
| Menção a pessoa desativada ou inexistente é descartada | idem | ✅ |
| Comentário vazio ou corpo que não é `doc` recusado | idem | ✅ |
| Só o autor edita; edição marca `editedAt` e grava `comment_edited` | idem | ✅ |
| Histórico formatado com pessoa e "Sistema"; comentário não vira linha | `tests/integration/activity.test.ts` | ✅ |
| Anexo: arquivo no volume, linha e evento; `../../etc/x.LOG` vira `x.LOG`, tipo `text/plain` mesmo com `text/html` do navegador | `tests/integration/attachments.test.ts` | ✅ |
| `.exe` e sem extensão → `UNSUPPORTED_TYPE`; 25 MB + 1 → `TOO_LARGE`; tarefa inexistente → nada gravado | idem | ✅ |
| Busca: sem acento, prefixo, `TI-`, número, `#GLPI`, `UM-`, abertas antes, `%_` e `!` sem resultado | `tests/integration/search.test.ts` | ✅ |
| NOTIFY chega aos assinantes depois do commit; escrita recusada não notifica | `tests/integration/realtime.test.ts` | ✅ |
| Rota de anexos: 400 tarefa inválida, 415 `.exe`, upload pela tela, download com `attachment` e `nosniff` | navegador (localhost:3000, TI-148) | ✅ |
| SSE na aba recebe `task.changed` do anexo | idem | ✅ |
| ⌘K: "visao" acha "visão"; "TI-161" + Enter abre a tarefa | idem | ✅ |
| ⌘K → detalhe → comentário com @menção → aba Menções; axe claro e escuro no detalhe | `tests/e2e/activity.spec.ts` | ✅ |
| Suíte | `npm test` | ✅ Vitest 61 (14 arquivos); após a M-039, 63 |
| E2E | `npx playwright test --workers=1` | ✅ 20 passaram, 12 pulados (mobile) |
| `declaredSizeStatus`: sem/inválido → 411; 26 MB → 413; 1 KB → segue | `tests/integration/attachments.test.ts` | ✅ |
| Escrita da pessoa chega com `by = userId`; a do agente dela, com `by: null` | `tests/integration/realtime.test.ts` | ✅ |
| Arrasto do `views.spec.ts` em paralelo, depois de centralizar a alça | `npx playwright test --project=desktop`, 5 + 3 rodadas | ✅ passou em todas |
| E2E em paralelo (padrão), suíte inteira | idem | ⚠️ `tasks.spec.ts` (1 de 8) e `activity.spec.ts` (1 de 8) falharam com a tela do detalhe em branco; ver Pontos de atenção |
| `npm run lint` / `npx tsc --noEmit` | — | ✅ 0 erros (1 aviso antigo em `tasks.test.ts`) |

## Commits

```
8c97243 docs(adr): add adr-048 comments, history, attachments, search and realtime
e824f6c feat(tasks): add comments with mentions
c63744b feat(tasks): add activity history
9c9fe9e feat(tasks): add attachments
9ef8533 feat(search): add command palette search
fdbcb1f feat(realtime): add server-sent events
74a3c37 fix(tasks): send plain json comment bodies to the server action
1cff6b7 fix(realtime): skip own changes and defer refresh while the user interacts
35a946f test(e2e): cover search, comments and mentions (inclui o aria-label do comentário só leitura)
6f5fa26 docs: document module 06 comments, history, attachments and search
24b8d08 style: format app layout
851ef33 test: write test attachments to a temp dir
```

Revisão (M-039):

```
d272d39 security(attachments): reject uploads without content-length
d9f152c fix(realtime): keep refreshing the owner's tab for agent writes
24ecc1b test(e2e): center the drag handle before dragging on the board
```

## Ficou de fora

- Excluir anexo e excluir comentário — sem fluxo no MVP (ADR-048).
- Notificar a pessoa mencionada (`notification.created` no SSE, e-mail, push) — Módulo 08.
- Comentário por agente (`add_comment`, corpo em markdown) — Módulo 07; o service já aceita `Actor` `agent`.
- Reordenar card na mesma coluna não grava `task_events`, então não notifica as outras abas.
- "Alternar tema" no ⌘K (`docs/UI.md` §9) — fica para "Minhas preferências".
- Teste E2E das rotas 401/413 — coberto pelo service e conferido à mão; sem teste automatizado da camada HTTP.

## Pontos de atenção

- **Tiptap → Server Action:** os `attrs` do nó `mention` não chegam como objeto simples; sem `JSON.parse(JSON.stringify(editor.getJSON()))` a action quebra com "Cannot access label on the server" (corrigido em `74a3c37`).
- **Editor só leitura:** o Tiptap põe `role="textbox"` também com `editable: false`; o axe exige nome, por isso `aria-label="Texto do comentário"`.
- **`router.refresh()` a cada mudança** de qualquer tarefa (ADR-048). Barato com 4 pessoas; se pesar, filtrar pelo `id` da tarefa aberta.
- **Um LISTEN por processo:** o cliente fica em `globalThis.__realtime`; não abrir `LISTEN` por requisição.
- **Backup:** anexos ficam no volume `itc-tasks-uploads`; sem backup definido (`docs/INFRA.md` §9).
- **E2E em paralelo — arrasto (resolvido na M-039):** o trace mostrou `mouse.down` em y=20 e o movimento em y=8. O `scrollIntoViewIfNeeded` deixava a alça colada no topo da janela; o arrasto “na mesma altura” passava pelo cabeçalho da coluna “A fazer”, fora da lista onde se solta, e o dnd-kit não disparava o `onDragEnd` (nenhum POST depois do drop). Dependia de onde o card caía na coluna, por isso variava com os dados das outras specs. Agora a alça é centralizada (`scrollIntoView({ block: "center" })`).
- **E2E em paralelo — detalhe em branco (aberto):** em `tasks.spec.ts` e `activity.spec.ts`, a URL muda para `/tarefas/N`, a resposta RSC chega com 200, mas o conteúdo não renderiza e o anúncio de rota continua em “Minhas tarefas”. No trace, o console mostra “[Fast Refresh] rebuilding” a cada 1–3 s durante a suíte, sem nenhum arquivo de código mudando (só `.next/dev/cache` e `test-results`): o `next dev` compila rotas sob demanda e avisa todas as abas, e a hipótese é que um desses rebuilds no meio da navegação a descarte. **Não confirmado:** a mesma corrida (`refresh()` seguido de `push()`) não reproduz no navegador, a página leva ~300 ms sozinha, e a comparação com `next start` não roda porque o login de produção exige https. Por isso não marquei essas specs como seriais nem mexi no app. `activity.spec.ts` usa o projeto BSBIA (o `views.spec.ts` move as tarefas “E2E” do QMPR em massa) e espera o detalhe por até 20 s. O E2E está fora do CI até o Módulo 11 (M-007).
