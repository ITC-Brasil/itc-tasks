<p align="center">
  <img src="public/brand/itc-tasks-horizontal-auto.svg" alt="ITC Tasks" height="56">
</p>

<p align="center">
  Gestor de tarefas do time de TI do Grupo ITC Brasil — com servidor MCP embutido para agentes.
</p>

<p align="center">
  <a href="https://tasks.itcbr.xyz"><strong>tasks.itcbr.xyz</strong></a> ·
  <a href="docs/PRD.md">Produto</a> ·
  <a href="docs/ARCHITECTURE.md">Arquitetura</a> ·
  <a href="docs/API.md">MCP e API</a> ·
  <a href="docs/PROGRESS.md">Progresso</a>
</p>

---

## O que é

O ITC Tasks substitui o Windshift no dia a dia da TI (4 pessoas). Cada tarefa nasce ligada a um
**Projeto/Cliente** (obrigatório) e pode carregar a **Unidade Móvel** e o **Chamado GLPI**. Pessoas
usam o app no navegador ou instalado como PWA; agentes de IA operam as mesmas tarefas pelo
servidor MCP em `/mcp`, sempre em nome de quem é dono do token.

**Principais recursos**

- Tarefas com ID `TI-<n>`, checklist, etiquetas, prioridade, prazo e vários Projetos/Clientes e UMs
- Visões Kanban, Lista, Calendário e Minhas tarefas, com filtros na URL e filtros salvos
- Comentários com @menção (Tiptap), histórico completo, anexos de até 25 MB e busca ⌘K
- Atualização em tempo real (SSE) entre abas e pessoas
- Notificações no app, Web Push e resumo diário por e-mail às 08:00
- Automações (regras com laço limitado) e templates de tarefa e de projeto
- Ciclos, marcos e painel de métricas
- PWA instalável, telas mobile e tema claro/escuro salvo por usuário
- Servidor MCP com tokens por pessoa e permissões `tasks:read` / `tasks:write`

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node 24.22.0 LTS, npm 11.19.1 (sem pnpm/yarn — ADR-031) |
| App | Next.js 16.4.2 (standalone), React 19.3.1, TypeScript 7 |
| UI | Tailwind 4.3.3, shadcn + Base UI, lucide-react, TanStack Table, dnd-kit, Recharts |
| Dados | PostgreSQL 18.6, Drizzle ORM 0.45.4, Zod 4.6.7 |
| Auth | Better Auth 1.7.10 com Argon2id, plugins `admin` e `apiKey` |
| Jobs | pg-boss 12.38.0 no processo `worker` |
| Agentes | `@modelcontextprotocol/sdk` 1.32.1 (Streamable HTTP) |
| Testes | Vitest 5, Playwright 1.64 + axe |

As versões exatas estão no `package.json` (sempre fixadas, `save-exact=true`).

## Arquitetura em uma tela

```
Navegador / PWA ──┐                          ┌── worker (pg-boss)
                  ├─► Next.js ─► services ─► PostgreSQL ◄──┤  automações, notificações,
Agente MCP ───────┘   (actions, /mcp, /api)   (task_events) │  lembretes, push, e-mail
```

- **Toda escrita passa por `src/server/services/`** com um `Actor` (`user`, `agent`, `automation`,
  `system`). Server Actions e ferramentas MCP só validam, chamam o service e mapeiam erros.
- **`task_events` é só-inserção**: cada mudança deixa rastro com o autor.
- Cadastros nunca são excluídos, só arquivados. Migrações são só aditivas.

Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e decisões em
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Rodando localmente

Pré-requisitos: Node 24.22.0, Docker com Compose.

```bash
git clone git@github.com:itc-brasil/itc-tasks.git
cd itc-tasks
git config core.hooksPath .githooks          # obrigatório: bloqueia push na main (ADR-034)

cp .env.example .env                          # preencha os valores
docker compose -f docker-compose.dev.yml up -d   # Postgres 18.6 + Mailpit
npm ci
npm run db:migrate
npm run db:seed                               # status, etiquetas, automações e o admin

npm run dev                                   # app em http://localhost:3000
npm run worker:dev                            # em outro terminal: jobs e notificações
```

### Variáveis de ambiente

| Grupo | Variáveis |
|---|---|
| Banco | `DATABASE_URL`, `DATABASE_URL_TEST` |
| Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| Seed do admin | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` (opcional) |
| App | `GLPI_BASE_URL`, `APP_TIMEZONE`, `UPLOADS_DIR` |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` |

O env é validado na inicialização (`@t3-oss/env-nextjs`). Os valores de produção ficam no
Vaultwarden — nunca em arquivo versionado.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | App em desenvolvimento, build e produção |
| `npm run worker:dev` / `npm run worker:build` | Worker pg-boss (watch / bundle em `dist/worker.mjs`) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle: gerar migração, aplicar, inspecionar |
| `npm run db:seed` | Dados iniciais e usuário admin |
| `npm run lint` / `npm run typecheck` / `npm run format:check` | Qualidade de código |
| `npm test` | Vitest (unit + integração) |
| `npm run test:integration` | Só integração — **sempre no banco `itc_tasks_test`** |
| `npm run test:e2e` | Playwright + axe |

> A suíte E2E é estável contra o build de produção:
> `npm run build && BETTER_AUTH_URL=http://localhost:3200 npx next start -p 3200`
> e depois `E2E_BASE_URL=http://localhost:3200 npx playwright test`.

## Servidor MCP

Gere um token em **Configurações › Agentes e MCP** e configure o cliente:

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

| Permissão | Ferramentas |
|---|---|
| `tasks:read` | `list_tasks`, `get_task`, `list_projects`, `list_mobile_units`, `list_cycles` |
| `tasks:write` | `create_task`, `update_task`, `complete_task`, `add_comment` |

Limite de 60 requisições/min por token. Agentes não excluem tarefas. Contrato completo,
erros e exemplos em [`docs/API.md`](docs/API.md).

## Estrutura

```
src/
  app/            rotas Next.js: (app), (auth), api/, mcp/
  components/     Design System e telas
  db/             schema Drizzle, seed
  lib/validation/ schemas Zod
  server/
    services/     regras de negócio e toda escrita
    actions/      Server Actions
  styles/         tokens do Design System (globals.css)
worker/           processo pg-boss
drizzle/          migrações
scripts/          deploy, migração em produção, importação do Windshift
tests/            integração e E2E
docs/             documentação do projeto
public/           marca, ícones, splash, service worker
```

## Identidade visual

Tokens em `src/styles/globals.css` — nunca hex em componente. Tema só claro e escuro, Inter na UI,
ícones lucide com `strokeWidth={1.75}`. Componentes obrigatórios e regras de contraste em
[`docs/UI.md`](docs/UI.md); a marca está em `public/brand/` e `docs/brand/`.

## Fluxo de trabalho

- Trabalho na `develop` (ou `feat/…` → `develop`), **um commit por tarefa**, mensagens
  `type(scope): descrição` (`feat`, `fix`, `security`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`).
- A `main` só recebe PR `develop → main` com CI verde, merge com **Create a merge commit**.
- Decisão nova com alternativa razoável → ADR em `docs/DECISIONS.md` antes do código.
- `git add` arquivo por arquivo; nada de `git add -A`.

### CI/CD

| Workflow | Quando | O que roda |
|---|---|---|
| `ci.yml` | push e PR em `main`/`develop` | Quality Check (typecheck, lint, format, migrações, Vitest com cobertura, build, `npm audit --omit=dev`), E2E, Docker build |
| `security.yml` | push, PR e semanal (segunda) | Gitleaks no histórico |
| `deploy.yml` | push na `main` | SSH no `glpi-srv` → `scripts/deploy.sh` (build, migração, restart) |

> **Atenção:** merge na `main` publica direto em produção.

## Produção

| Item | Valor |
|---|---|
| URL | https://tasks.itcbr.xyz (MCP em `/mcp`, saúde em `/api/health`) |
| Servidor | `glpi-srv`, pasta `/home/glpissh/docker/itc-tasks` |
| Containers | `itc-tasks`, `itc-tasks-worker`, `itc-tasks-db` |
| Publicação | Túnel Cloudflare `itcbr-tunnel` do host → `127.0.0.1:3021` |
| Imagens | Build no próprio servidor, sem registry (ADR-027) |
| E-mail | Titan Mail, `tasks@itcbr.xyz` |

Deploy manual, rollback e cuidados do servidor em [`docs/INFRA.md`](docs/INFRA.md).

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Produto e escopo |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | ADRs |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Banco de dados |
| [`docs/API.md`](docs/API.md) | MCP e rotas |
| [`docs/FLOWS.md`](docs/FLOWS.md) | Fluxos |
| [`docs/UI.md`](docs/UI.md) | Interface e Design System |
| [`docs/INFRA.md`](docs/INFRA.md) | Servidor, túnel e deploy |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Estado atual |
| [`docs/modules/`](docs/modules/) | Um documento por módulo (00 a 14) |
| [`CLAUDE.md`](CLAUDE.md) | Regras para agentes que trabalham no código |

---

<sub>Uso interno do Grupo ITC Brasil. Repositório privado.</sub>
