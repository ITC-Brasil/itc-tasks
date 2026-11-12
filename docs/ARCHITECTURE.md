# ITC Tasks — Arquitetura (TRD)

> Estado: pré-implementação (17/10/2026). Caminhos e arquivos são **planejados**; quando um
> módulo for concluído, a seção correspondente passa a citar o arquivo real.

## Visão geral

Um monólito Next.js 16 serve a interface e o servidor MCP; um processo `worker` (mesma imagem)
executa jobs do pg-boss. Toda escrita — da tela, de um agente, de uma automação ou de um job —
passa pela camada `src/server/services/`, que valida com Zod, aplica as regras, grava no
PostgreSQL e registra um `task_event`. Mudanças são publicadas por `NOTIFY` e chegam aos
navegadores por SSE.

## Stack (resumo)

| Camada | Tecnologia |
|---|---|
| UI | React 19.3 + shadcn 4.22 (Base UI 1.9) + Tailwind 4.3, TanStack Query 5, dnd-kit React 0.5, cmdk, Tiptap 3, Recharts 3 |
| Servidor | Next.js 16.4 (App Router, Server Components, Server Actions, Route Handlers) |
| Agentes | `@modelcontextprotocol/sdk` 1.32 em `/mcp` (Streamable HTTP) |
| Auth | Better Auth 1.7 (admin + apiKey) + Argon2id |
| Dados | PostgreSQL 18.6, Drizzle 0.45, driver `pg` 8.23 |
| Jobs | pg-boss 12.38 em processo `worker` |
| Notificações | SSE, Web Push (VAPID), SMTP |
| PWA | `app/manifest.ts` + service worker próprio em `public/sw.js` (ADR-054) |
| Infra | Docker no `glpi-srv` (Dell R250) + túnel `itcbr-tunnel` já existente |

## Decisões estruturais

- **Camada de serviço única** (ADR-003). Server Actions (`src/server/actions/`) e ferramentas MCP (`src/server/mcp/`) só validam input, chamam o service e traduzem erros. Nenhum componente ou rota escreve no banco diretamente.
- **`Actor` explícito em toda escrita.** Assinatura padrão: `createTask(actor: Actor, input: CreateTaskInput): Promise<Task>`. O `Actor` define permissão e vai para `task_events`.
- **Erros de domínio tipados.** `DomainError` com `code` (`VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `ARCHIVED_REFERENCE`, `CONFLICT`) mapeado para mensagem em PT na UI e para erro MCP (`isError: true` + `code`) no agente.
- **Server Components por padrão.** Client Components só onde há interação (board, editor, paleta, formulários).
- **Leituras no servidor, cache no cliente.** Páginas carregam dados no servidor; o TanStack Query assume no cliente e aplica atualização otimista nas mutações frequentes (mover card, marcar item, concluir).
- **Validação sempre no servidor**, com os mesmos schemas Zod da UI (ADR-006).
- **Sem SQL cru fora de `src/db/` e `src/server/services/`.**
- **Datas:** `timestamptz` no banco; prazos (`dueDate`) são `date` (sem hora); fuso de exibição `America/Sao_Paulo`.
- **Ordem no board:** `tasks.position` em índice fracionário (texto), reordenar não reescreve a coluna inteira.
- **Banco de teste isolado:** Vitest usa `DATABASE_URL_TEST` (banco `itc_tasks_test`) e `fileParallelism: false` nos testes de integração.

## Fluxo de dados principal (criar tarefa)

1. **UI:** a criação rápida valida no cliente com `createTaskSchema` e chama a Server Action `createTaskAction`.
2. **Action:** obtém a sessão (`auth.api.getSession`), monta `Actor { kind: 'user' }`, chama `tasksService.create`.
3. **Service:** valida de novo com Zod; confere Projeto/Cliente e UM ativos; em transação, insere `tasks`, `checklist_items` (se template) e `task_events` (`created`); dispara `NOTIFY task_changed`.
4. **Jobs:** o service publica `automation.evaluate` e `notification.fanout` no pg-boss; o `worker` avalia regras e cria `notifications`, envia push/e-mail conforme preferências.
5. **Tempo real:** `/api/events` escuta `task_changed`/`notification_created` e envia SSE; os clientes invalidam as queries afetadas.
6. **Agente:** o mesmo caminho do passo 3, com `Actor { kind: 'agent', userId: <dono do token>, apiKeyId }`, a partir de `/mcp`.

Diagramas de sequência: `docs/FLOWS.md`.

## Processos e containers (produção)

| Serviço | Imagem | Comando | Volumes | Portas no host |
|---|---|---|---|---|
| `itc-tasks` | `itc-tasks:local` (build local, ADR-027) | `node server.js` (Next standalone) | `itc-tasks-uploads:/data/uploads` | `127.0.0.1:3021:3000` |
| `itc-tasks-worker` | mesma | `node worker/index.js` | `itc-tasks-uploads:/data/uploads` | nenhuma |
| `itc-tasks-db` | `postgres:18.6-alpine` | — | `itc-tasks-db-data:/var/lib/postgresql` | nenhuma |

**Onde roda:** `glpi-srv` (Dell PowerEdge R250, Ubuntu 24.04.4, Docker 29.5.3), pasta
`/home/glpissh/docker/itc-tasks` — o padrão do servidor, onde estão todos os containers (`~/docker/<nome>`, junto de
`notescan`, `n8n`, `vaultwarden` etc.). Repositório e `.env` ficam só nessa pasta. Saída pela interface
`eno8403` (RB750r2/Claro).

**Publicação (ADR-028):** o `cloudflared` roda no host como serviço systemd e lê
`/etc/cloudflared/config.yml`. Entrada nova, antes do catch-all:

```yaml
  # ITC Tasks
  - hostname: tasks.itcbr.xyz
    service: http://localhost:3021
```

```bash
cloudflared tunnel route dns itcbr-tunnel tasks.itcbr.xyz
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
```

Porta `3021` confirmada livre no `glpi-srv` em 17/10/2026 com `ss -tlnH` (a `3020` já estava ocupada;
a lista de portas do guia do servidor está desatualizada — sempre conferir no próprio host).
Ligada só em `127.0.0.1`: o túnel acessa por `localhost`, então não há regra nova no UFW.

**Deploy (padrão do NoteScan):** merge na `main` → `deploy.yml` → SSH em
`glpi.grupoitcbrasil.com.br:2222` como `github-deploy` → `scripts/deploy.sh` (`git pull origin main`,
`docker compose up -d --build` em `/home/glpissh/docker/itc-tasks`, espera `/api/health`). A pasta pertence ao
`github-deploy` (como a do NoteScan); manutenção manual com `sudo -u github-deploy`. Secrets do GitHub: `DEPLOY_HOST` (sem porta),
`DEPLOY_PORT` (`2222`), `DEPLOY_USER` (`github-deploy`), `DEPLOY_SSH_KEY`. As migrações rodam no
`scripts/docker-entrypoint.sh` antes do Next subir, como no NoteScan. Deploy manual de emergência:
`ssh glpissh@100.68.161.44` (Tailscale) e `sudo -u github-deploy bash ~/docker/itc-tasks/scripts/deploy.sh`.

**Padrões do servidor seguidos:** `container_name` explícito, `restart: always`,
`TZ=America/Sao_Paulo`, monitor HTTP no Uptime Kuma (`https://tasks.itcbr.xyz/api/health`),
item no Homepage (`dash.itcbr.xyz`). **Sem label do Watchtower** nos três containers: `app` e
`worker` são construídos localmente (não há imagem para puxar) e o Postgres é atualizado à mão.

## Restrições de infraestrutura

Estas não são limites operacionais: elas moldaram decisões.

| Restrição | Origem | Consequência arquitetural |
|---|---|---|
| ~100 s de timeout por requisição | Cloudflare Tunnel | Nada pesado na requisição: automações, e-mail e push em job (ADR-010) |
| Upload até 100 MB | Cloudflare Tunnel | Limite de anexo em 25 MB, validado antes de gravar (ADR-025) |
| Conexões ociosas podem ser fechadas | Cloudflare Tunnel | SSE com heartbeat a cada 25 s e reconexão automática no cliente (ADR-020) |
| Cloudflare Access (se ativado) exige login no navegador | Cloudflare | `/mcp` e `/api/push/*` com service token ou regra de bypass (ADR-009) |
| Sem object storage na ITC | Infra local | Anexos em volume local (ADR-025); sem backup definido no MVP (`docs/INFRA.md` §9) |
| Push no iOS só com app instalado | Safari/iOS 16.4+ | Tela de preferências orienta a instalar o PWA (ADR-017) |
| GLPI em HTTP, porta 8888 | `http://glpi.grupoitcbrasil.com.br:8888` | O app só gera link (ADR-023); a URL não entra na CSP de `connect-src`. Abre em nova aba e só funciona onde o GLPI for alcançável |
| Titan Mail não informa limite de envio para scripts | Titan | Envio sempre por job com retentativa; resumo diário agrupa avisos para manter o volume baixo (ADR-026) |

## Segurança (arquitetura)

- Sessões em cookie HTTP-only; tokens MCP por `Authorization: Bearer`, verificados pelo plugin `apiKey` e convertidos em `Actor`.
- Permissões checadas no service, nunca só no cliente ou só na rota.
- **Escopo de leitura de tarefa (ADR-069):** `visibleTo(actor)` em `src/server/services/tasks.ts` é a única regra de quem lê uma tarefa (`visibility = 'team'` ou criada pela pessoa do ator; automação e sistema só `team`). Consultas de lista e busca a usam direto; leitura por id (comentários, histórico, anexos) usa `assertVisible`; toda escrita começa em `lockTask(tx, id, actor)`. As visões e os números da equipe somam `teamOnly`. O SSE filtra por dono em `forSession` (`src/server/realtime.ts`) e o fanout de notificações só entrega ao dono. Função nova que toca `tasks` usa um desses quatro pontos e ganha um caso em `tests/integration/personal-tasks.test.ts`.
- Rate limit: Better Auth nas rotas de auth; 60 req/min por token no `/mcp` (contador em Postgres).
- Cabeçalhos estáticos em `next.config.ts` (ADR-059): CSP sem nonce (`'unsafe-inline'` em script/style; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action`/`connect-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` e HSTS (só produção).
- Segredos só em variáveis de ambiente validadas por `src/lib/env.ts`.

## Variáveis de ambiente (planejadas)

| Variável | Uso |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_TEST` | Postgres |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Better Auth |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Primeiro admin (só no seed) |
| `GLPI_BASE_URL` | Link do chamado — `http://glpi.grupoitcbrasil.com.br:8888` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Titan Mail: `smtp.titan.email` / `465` / `true` (alternativa: `587` com STARTTLS) — ADR-026 |
| `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | Caixa `tasks@itcbr.xyz` (a criar no Titan); senha de aplicativo se a caixa tiver 2FA; `MAIL_FROM="ITC Tasks <tasks@itcbr.xyz>"` |
| `UPLOADS_DIR` | `/data/uploads` |
| `APP_TIMEZONE` | `America/Sao_Paulo` |

## Observabilidade

Logs JSON com `pino` (stdout dos containers), `requestId` por requisição e `actor` nas
escritas. `/api/health` verifica banco e fila. Métricas e alertas: fora do MVP.

## Infra local

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres:18.6-alpine + mailpit
npm install
npm run db:migrate && npm run db:seed
npm run dev            # app em http://localhost:3000
npm run worker:dev     # pg-boss em modo watch
```

Mailpit em `http://localhost:8025` captura os e-mails em desenvolvimento.
