# Módulo 08 — Notificações

**Status:** pronto para revisão em 17/10/2026, na `develop`. ADR-050 escrito antes do código.

PRD N1 (central com não lidas, todas e menções; "Marcar todas como lidas"), N2 (os 7 eventos), N3 (canais no app, push e e-mail; silêncio de push fora do expediente; resumo diário) e N4 (ações do próprio usuário não notificam ele mesmo).

## O que foi implementado

### Schema
- `drizzle/0010_notifications.sql` (só aditiva): enum `notification_event` (`assigned`, `mentioned`, `commented`, `due_today`, `overdue`, `status_changed`, `agent_action`) e as tabelas `notifications`, `notification_preferences` (PK `user_id, event`) e `push_subscriptions` (índice único `push_subscriptions_endpoint_uq`).
- `src/db/schema/notifications.ts` — em relação ao planejado no SCHEMA, `notifications` ganhou `in_app`, `email` (canais copiados da preferência no momento) e `emailed_at` (o resumo não reenvia).
- Sem seed das 7 linhas de preferência: linha ausente = `DEFAULT_CHANNELS` (`src/lib/notifications.ts`).

### Fila e worker
- `src/server/jobs.ts` — `QUEUES` (`notification.fanout`, `notification.push`, `daily.morning`); `enqueue(tx, name, data)` faz `boss.send` com `db: { executeSql }` sobre a transação do Drizzle (`toSql` converte `$1…` do pg-boss em parâmetros). O `PgBoss` do processo web tem `supervise: false`, `schedule: false` e cria schema `pgboss` e filas no primeiro uso (a escrita não depende de o worker já ter rodado).
- `src/server/services/tasks.ts` — `record()` passou a usar `.returning({ id })` e enfileira `notification.fanout { eventIds }` na mesma transação. `field_changed` da descrição grava `mentions` (só os mencionados novos). `mentionIds` mudou de `comments.ts` para `tasks.ts` (reexportado).
- `worker/index.ts` — `PgBoss` completo (migra), `createQueue` das 3 filas, `work` de cada uma e `schedule("daily.morning", "0 8 * * *", null, { tz: APP_TIMEZONE })`. Em produção recusa iniciar sem `VAPID_*`, `SMTP_HOST` e `MAIL_FROM`. `SIGTERM`/`SIGINT` → `stop({ graceful: true })`.
- `npm run worker:dev` — `tsx watch --env-file-if-exists=.env worker/index.ts`. `npm run worker:build` — esbuild empacota tudo em `dist/worker.mjs` (3,1 MB; `pg-native` externo; banner com `createRequire`).
- `Dockerfile` roda `npm run build && npm run worker:build` e copia `dist/worker.mjs`; `docker-compose.yml`: `itc-tasks-worker` sem o perfil `worker`, `command: ["node", "dist/worker.mjs"]`.
- `src/app/api/health/route.ts` — `queue: "ok"` se `select 1 from pgboss.version` responde; senão `queue: "down"` e 503.

### Service
`src/server/services/notifications.ts`:
- `fanout(eventIds)` — tabela de destinatários do ADR-050 numa transação; autor excluído (`actor_user_id`, o que inclui o agente do dono); `actorLabel` = primeiro nome, nome do token para agente, "Automação"/"Sistema". `deliver()` filtra pessoas ativas, aplica a preferência, insere, faz `pg_notify('notification_created', { id, userId, event, unreadCount })` se `in_app` e enfileira `notification.push` se `push`.
- `pushNotification(id, now)` — `"quiet"` fora de `[quietHoursStart, quietHoursEnd)` (`withinHours`, fuso `APP_TIMEZONE`); senão `web-push` para cada assinatura (`TTL: 3600`), 404/410 apaga a assinatura. Sem VAPID o envio é ignorado.
- `daily(now)` — `reminders` (abertas, não arquivadas, `due_date` = hoje → `due_today`, = ontem → `overdue`, sem repetir em 20 h) e depois `digest` (um e-mail por pessoa com `emailDigest` e notificações `email` das últimas 24 h sem `emailed_at`; texto e HTML com links `BETTER_AUTH_URL/tarefas/<n>`).
- Tela: `listNotifications(actor, "unread" | "all" | "mentions")` (até 200), `unreadCount`, `markRead(actor, ids?)` (só as próprias), `getPreferences`, `setChannel`, `setSchedule`, `subscribePush` (upsert por endpoint), `unsubscribePush`, `sendTestPush`.
- `src/lib/validation/notifications.ts` — `notificationPreferencesSchema`, `quietHoursSchema` (`HH:mm`, início ≠ fim), `pushSubscriptionSchema` (endpoint `https://`), `markReadSchema`.
- `src/lib/notifications.ts` — eventos, `DEFAULT_CHANNELS`, `EVENT_LABELS`, `verb`, `describe` (linha do push/e-mail) e `withinHours`.

### Rotas e actions
- `src/app/api/push/subscribe/route.ts` (`POST` 201 / 400, `DELETE` 204) e `src/app/api/push/test/route.ts` (`POST` 202 `{ sent }`).
- `src/app/api/events/route.ts` — `notification.created` só para a aba da própria pessoa, sem o `userId`; `src/server/realtime.ts` escuta também `notification_created`.
- `src/server/actions/notifications.ts` — `markNotificationsReadAction`, `setNotificationChannelAction`, `setNotificationScheduleAction`.
- `public/push-sw.js` — service worker mínimo (`push` → `showNotification`; clique abre/foca a tarefa). `public/sw.js` fica livre para o Serwist (está no `.gitignore`). `src/proxy.ts` não redireciona `push-sw.js`.

### Telas
- `/notificacoes` (`src/app/(app)/notificacoes/`) — abas Não lidas / Todas / Menções, grupos Hoje / Ontem / Antes, ponto e fundo de não lida, citação do comentário, `TextChip` do tipo, tempo relativo; abrir marca como lida; "Marcar todas como lidas"; EmptyState "Tudo em dia".
- Sidebar: item "Notificações" (`Bell`) com contador de não lidas (`unreadCount` no `(app)/layout.tsx`); `LiveRefresh` recarrega em `notification.created`.
- `/config/preferencias` — matriz evento × canal (grava a cada clique, desfaz se falhar), tema claro/escuro, "Push neste dispositivo" (`src/components/notifications/push-device.tsx`: ativar, testar, desativar; aviso do iPhone), expediente e resumo diário. Aba nova em Configurações; item "Minhas preferências" na sidebar de membros.

## Verificação

| Cenário | Como verificado | Resultado |
|---|---|---|
| Escrita enfileira o fanout na transação; escrita recusada não | `tests/integration/notifications.test.ts` | ✅ +1 job em `pgboss.job`; rollback não deixa job |
| Atribuir avisa o responsável; autor não recebe; atribuir a si não avisa | idem | ✅ |
| Comentário com menção: mencionado `mentioned` com citação, criador `commented` | idem | ✅ `quote: "@Bia veja o rack"`, `actorLabel: "Caio"` |
| Descrição: só mencionados novos | idem | ✅ |
| Status → criador com nomes; agente → responsável/criador `agent_action` com nome do token; agente do dono não avisa o dono | idem | ✅ |
| Preferência desligada não grava; pessoa desativada não recebe | idem | ✅ |
| Marcar uma (de outra pessoa não mexe), marcar todas, contador | idem | ✅ |
| Push às 22:00 com expediente 08–18 | idem | ✅ `"quiet"`; às 10:00 `"sent"` |
| 08:00 duas vezes: prazo hoje e vencida uma vez; um e-mail com as duas | idem (nodemailer mockado) | ✅ |
| Assinatura `http://` recusada; teste entregue; 410 apaga a assinatura | idem (web-push mockado) | ✅ |
| Expediente atravessando a meia-noite | `src/lib/notifications.test.ts` | ✅ |
| Central (abas, axe) e Preferências (canal e horário persistem após recarregar, axe) | `tests/e2e/notifications.spec.ts` (desktop, 3 rodadas) | ✅ |
| Worker sobe contra o banco de dev | `npm run worker:build` + `node --env-file=.env dist/worker.mjs` | ✅ "worker: pronto" |
| Suíte | `npm test` | ✅ 17 arquivos, 87 testes |
| E2E desktop completo | `npx playwright test --project=desktop` | ✅ 18 passaram |
| Lint, tipos, formato | `npm run lint`, `npm run typecheck`, `npm run format:check` | ✅ 0 erros |

## Commits

```
9d93ed3 docs: add adr-050 notifications
aaedbb8 feat(jobs): add worker
c787974 feat(notifications): add inbox
949225f feat(notifications): add web push
2eaf36e feat(notifications): add preferences
```

O resumo diário e os lembretes (tarefa "E-mail e resumo diário 08:00; lembrete de prazo e vencidas") saíram no `feat(jobs): add worker`: são o job `daily.morning` do mesmo service e do mesmo worker.

## Ficou de fora
- Menção nova ao **editar** um comentário não notifica (só ao criar).
- O interruptor "Silenciar push fora do expediente" da tela de referência: o silêncio é sempre ligado, ajusta-se o horário (ADR-050).
- Atalho `G` `N` (sequência de duas teclas) — Módulo 11, com os demais atalhos de navegação.
- Paginação da central (mostra até 200).
- Ícone próprio do push (usa `apple-touch-icon.png`) e o Serwist — Módulo 11.
- Automações como destinatários ("notificar time") — Módulo 09.

## Pontos de atenção
- **N4 e o agente:** o agente conta como o dono do token, então o agente do Matheus não avisa o Matheus. Se o time quiser ver as ações dos próprios agentes, é trocar o `author` no `fanout` (decisão de produto, perguntada na M-047).
- **Banco de dev:** depois do pull, `npm run db:migrate` (sem a `0010`, o layout quebra no `unreadCount`). Sem `npm run worker:dev`, os jobs ficam na fila e são processados quando o worker subir.
- **VAPID:** trocar as chaves depois do go-live invalida as assinaturas (`docs/INFRA.md`).
- **E2E:** `toBeHidden()` passa na hora se a página ainda nem carregou depois do `reload()`; o spec espera o estado final do "Push neste dispositivo" como sinal de hidratação.
