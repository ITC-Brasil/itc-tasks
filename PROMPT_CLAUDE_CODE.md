# PROMPT — Início do desenvolvimento do ITC Tasks

> **Antes de enviar (Matheus, no Windows):**
> 1. Instale o Git, o Node 24.22.0 (já traz o npm 11.19.1) e o Docker Desktop.
> 2. No GitHub, crie o repositório privado `ITC-Brasil/itc-tasks`, vazio (sem README nem `.gitignore`).
> 3. Clone o repositório vazio em `C:\Projetos\trabalho\itc-tasks`.
> 4. Conecte essa pasta ao projeto ITC Tasks no Cowork. O Cowork copia para ela a documentação,
>    a marca, o `.gitignore`, o `.gitattributes` e a pasta `.conversa/`.
> 5. Abra o Claude Code na raiz da pasta e envie este arquivo como primeira mensagem.

## Contexto

Você vai construir o **ITC Tasks**, gestor de tarefas do dia a dia do time de TI do Grupo ITC
Brasil (4 pessoas), substituto do Windshift. Leia, nesta ordem, antes de qualquer código:

1. `CLAUDE.md` — regras permanentes
2. `docs/PRD.md` — o que construir e o que fica fora
3. `docs/ARCHITECTURE.md` — camadas, fluxo de dados, restrições de infra
4. `docs/DECISIONS.md` — ADR-001 a ADR-031 (não reabra decisões sem um ADR novo)
5. `docs/SCHEMA.md` — schema Drizzle de partida (fonte única; não duplicar em outro lugar)
6. `docs/API.md` — contrato do MCP e rotas
7. `docs/FLOWS.md` e `docs/UI.md` — comportamento e interface

Telas de referência: https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9
Design System: https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495

## Stack — versões exatas (levantadas em 17/10/2026)

Instale **exatamente** estas versões (`npm install --save-exact <pkg>@<versão>`; o `.npmrc` do repositório tem `save-exact=true`). Se alguma não instalar ou
for incompatível, pare, descreva o problema e proponha um ADR antes de trocar.

```
node 24.22.0 (LTS) · npm 11.19.1 · postgres 18.6 · cloudflared 2026.10.1

next@16.4.2 react@19.3.1 react-dom@19.3.1 typescript@7.0.2
tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 shadcn@4.22.0 @base-ui/react@1.9.0
class-variance-authority@0.7.1 tailwind-merge@3.7.0 clsx@2.1.1 tw-animate-css@1.4.0
lucide-react@1.58.0 next-themes@0.4.6 sonner@2.0.8
@tanstack/react-query@5.104.3 @tanstack/react-table@9.3.1 @dnd-kit/react@0.5.1 cmdk@1.1.1 motion@14.3.0
@tiptap/react@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/pm@3.32.0 recharts@3.10.1
react-hook-form@7.90.0 @hookform/resolvers@5.9.1 date-fns@4.4.0
drizzle-orm@0.45.4 drizzle-kit@0.31.11 drizzle-zod@0.8.3 pg@8.23.1 zod@4.6.7 @t3-oss/env-nextjs@0.13.11
better-auth@1.7.10 @node-rs/argon2@2.2.2 @modelcontextprotocol/sdk@1.32.1 pg-boss@12.38.0
web-push@3.6.7 nodemailer@10.1.2 pino@10.4.0
serwist@9.5.13 @serwist/turbopack@9.5.13 (ou @serwist/next@9.5.13 se o build usar webpack)
vitest@5.0.5 @playwright/test@1.64.1 @axe-core/playwright@4.14.0 eslint@10.13.0 prettier@3.9.10
```

## Identidade visual

- Tokens: `docs/UI.md` §1 e a tabela de `documentacao-itc-tasks.md` §7. Claro padrão, escuro em `[data-theme="dark"]`.
- Fontes: Inter 400–800 (UI, `tabular-nums` em dados), Archivo 600/800 (só lockup).
- Marca: `public/brand/` com os SVGs `itc-tasks-simbolo-*` e `itc-tasks-horizontal-*`; PWA em `public/icons/` e `public/splash/`.
- Tom: português do Brasil, direto, caixa de frase, sem emoji.

## Papéis

| Papel | Pode |
|---|---|
| `admin` | Tudo, incluindo membros, workflow, cadastros, automações, tokens de qualquer pessoa |
| `member` | Tarefas, ciclos, marcos, comentários, templates, os próprios tokens e preferências |
| Agente | Ferramentas MCP permitidas pelo token, em nome do dono |

## Docker Compose de desenvolvimento (`docker-compose.dev.yml`)

```yaml
services:
  db:
    image: postgres:18.6-alpine
    environment:
      POSTGRES_USER: itc
      POSTGRES_PASSWORD: itc
      POSTGRES_DB: itc_tasks
    ports: ["5435:5432"]   # 5434 já é do NoteScan local; uma porta por projeto
    volumes: [db-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U itc -d itc_tasks"]
      interval: 5s
  mailpit:
    image: axllent/mailpit:v1.31.6
    ports: ["8025:8025", "1025:1025"]
volumes:
  db-data:
```

Criar também o banco `itc_tasks_test` para os testes de integração.

## Variáveis de ambiente

Ver `docs/ARCHITECTURE.md` › Variáveis de ambiente. Gerar `.env.example` com todas, validadas
em `src/lib/env.ts`.

## Regras de desenvolvimento

1. **Toda escrita passa por `src/server/services/`** com um `Actor` (ADR-003). Actions e ferramentas MCP são finas.
2. **Zod no servidor sempre**, com os schemas de `src/lib/validation/` (ADR-006).
3. **Projeto/Cliente obrigatório** em toda criação de tarefa — testado na UI e no MCP.
4. **Cadastros nunca são excluídos** (ADR-018).
5. **Nada de hex solto em componente**; só tokens.
6. Server Components por padrão; Client Component só com interação.
7. Testes de integração contra `itc_tasks_test`, nunca contra o banco de desenvolvimento.
8. Uma decisão nova com alternativa razoável → ADR em `docs/DECISIONS.md` antes do código.
9. Commits pequenos, Conventional Commits, um por tarefa concluída.
10. Nunca `git add -A`; adicionar arquivo por arquivo e conferir `git status --short`.

## Modo de execução

Sequencial, um módulo por vez. Cada módulo começa numa sessão nova do Claude Code.

**Início de cada sessão (a partir do Módulo 01):**
1. Leia `CLAUDE.md` e `docs/PROGRESS.md`.
2. Leia `.conversa/para-claude-code.md` e trate as mensagens ABERTAS antes do módulo novo.

**Fim de cada módulo:**
1. Preencha `docs/modules/NN-nome.md`.
2. Atualize `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/API.md` (se mudou) e a seção 6 de `documentacao-itc-tasks.md`.
3. Faça o commit `docs: document module NN name`.
4. Escreva em `.conversa/para-cowork.md` uma mensagem "Módulo NN pronto para revisão", com o que foi feito, o que ficou de fora e as dúvidas.
5. **Pare e peça aprovação** antes do próximo módulo.
6. Quando o módulo for aprovado, abra o PR `develop → main` (regra em `CLAUDE.md` › Modo de execução) e aguarde o "pode iniciar" do próximo módulo.

---

## Plano de módulos

### Módulo 00 — Fundação
- [ ] Criar `.npmrc` na raiz com duas linhas, `save-exact=true` e `engine-strict=true` (ADR-031; o Cowork não pode gravar esse arquivo)
- [ ] Commit inicial do que o Cowork deixou na pasta: confira com `git status --short` que `.conversa/` **não** aparece; adicione arquivo por arquivo (ou por pasta: `docs/`, `public/`) — commit `docs: add initial documentation and brand assets`; este é o único commit direto na `main`; depois crie a branch `develop`, envie as duas ao GitHub e siga o resto do módulo na `develop`
- [ ] `create-next-app` com Next 16.4.2, TypeScript 7, App Router, `src/`, npm (`--use-npm`). A pasta não está vazia: gere o app numa pasta temporária fora do repositório e traga os arquivos para a raiz sem sobrescrever `CLAUDE.md`, `docs/`, `public/`, `.gitignore` nem `.gitattributes` (junte as regras novas do `.gitignore` ao existente) — commit `chore: scaffold next.js app`
- [ ] Tailwind 4.3 + tokens do Design System em `src/styles/globals.css` (claro e escuro) — `feat(ui): add design system tokens`
- [ ] `shadcn init` com Base UI; componentes base (button, input, select, dialog, checkbox, switch, tooltip, popover, dropdown-menu, sonner) restilizados pelos tokens — `feat(ui): add base components on base ui`
- [ ] `docker-compose.dev.yml`, Drizzle (`drizzle.config.ts`, `src/db/index.ts`), migração custom (unaccent, `unaccent_immutable`, `task_number_seq`) — `feat(db): add drizzle setup and base migration`
- [ ] `src/lib/env.ts` com `@t3-oss/env-nextjs` e `.env.example` — `chore: add typed env`
- [ ] Vitest (unit + integração com banco de teste), Playwright, ESLint, Prettier — `test: add test tooling`
- [ ] GitHub Actions: `ci.yml` (Quality Check: `npm ci`, typecheck, lint com `eslint-plugin-security`, migrações no Postgres de serviço, Vitest com cobertura, `npm audit --audit-level=high`) e `security.yml` (Gitleaks), ações fixadas por SHA; sem CodeQL (ADR-029); `dependabot.yml` minor/patch, máx. 5 PRs — `ci: add quality check and security workflows`
- [x] ~~Proteção da `main`~~ — indisponível no GitHub Free para repositório privado; substituída por hook `pre-push` + PR por módulo (ADR-034)
- [ ] `scripts/docker-entrypoint.sh`: aplica migrações (`node dist/migrate.js` com o migrator do `drizzle-orm`, sem depender do `.bin` que o standalone não copia) e inicia o Next — `feat(db): run migrations on container start`
- [ ] `Dockerfile` (standalone, `node:24-alpine`) e `docker-compose.yml` de produção com `itc-tasks` (`127.0.0.1:3021:3000`), `itc-tasks-worker` e `itc-tasks-db`, no padrão do `glpi-srv` (`container_name`, `restart: always`, `TZ`, sem label do Watchtower, senhas só no `.env`) — ver `docs/ARCHITECTURE.md` — `chore: add production docker setup`
- [ ] `/api/health` — `feat(api): add health endpoint`
- [ ] Conferir a marca já copiada pelo Cowork (`public/brand/`, `public/icons/`, `public/splash/`, `favicon.ico`, `favicon.svg`; referências em `docs/brand/`)
- [ ] Escrever em `.conversa/para-cowork.md` a mensagem "Módulo 00 pronto para revisão"

### Módulo 01 — Autenticação e membros
- [ ] Better Auth (`src/server/auth.ts`), `disableSignUp`, plugins `admin` e `apiKey`, Argon2id (ADR-008), `baseURL`/`trustedOrigins` com `https://tasks.itcbr.xyz` (no NoteScan, faltar o host confiável gerou `UntrustedHost` em produção); gerar `src/db/schema/auth.ts` pelo CLI — `feat(auth): configure better auth with argon2id`
- [ ] Campos extras do usuário (`role`, `initials`, `theme`, `sidebarCollapsed`, horários, resumo) — `feat(auth): add user preference fields`
- [ ] Tela Entrar — `feat(auth): add login screen`
- [ ] Proteção do grupo `(app)` e helper `requireActor()` — `feat(auth): protect app routes`
- [ ] Seed do admin — `feat(db): seed first admin`
- [ ] Configurações › Membros (criar, desativar, trocar papel) — `feat(settings): add members management`
- [ ] Testes: login, rota protegida sem sessão, member tentando ação de admin — `test(auth): cover login and permissions`

### Módulo 02 — Layout, navegação e tema
- [ ] Sidebar expandida/recolhida (atalho `[`, salva no usuário), topbar, barra inferior mobile — `feat(layout): add app shell`
- [ ] Tema claro/escuro com next-themes, sem modo sistema, salvo no usuário, sem flash (ADR-013) — `feat(layout): add light and dark themes`
- [ ] Estrutura de atalhos de teclado (`?` lista) — `feat(layout): add keyboard shortcuts`
- [ ] Empty, loading e error padrão — `feat(ui): add state components`

### Módulo 03 — Cadastros
- [x] Schema `catalog.ts` + seed de status e etiquetas — `feat(db): add catalog schema`
- [x] `catalogService` com arquivamento (ADR-018) — `feat(catalog): add catalog service`
- [x] Telas Projetos/Clientes e Unidades Móveis — `feat(catalog): add projects and mobile units screens`
- [x] Configurações › Workflow e Etiquetas — `feat(settings): add workflow and labels`
- [x] Testes: sigla única, arquivado fora dos seletores — `test(catalog): cover archiving rules`

### Módulo 04 — Tarefas: núcleo
- [x] Schema `tasks.ts` (tasks, checklist, links, labels, events, comments, attachments) — `feat(db): add tasks schema`
- [x] `tasksService` (create, update, move, complete, bulk) com `task_events` — `feat(tasks): add tasks service`
- [x] Criação rápida (atalho `C`, "Criar outra", template) — `feat(tasks): add quick create`
- [x] Detalhe da tarefa (edição inline, subtarefas, vínculos, campos ITC, link GLPI) — `feat(tasks): add task detail`
- [x] Testes: sem Projeto/Cliente recusado; projeto arquivado recusado; `completedAt` ao entrar/sair de `done` — `test(tasks): cover core rules`

### Módulo 05 — Visões e filtros
- [ ] Kanban com `@dnd-kit/react`, posição fracionária, otimista — `feat(board): add kanban`
- [ ] Lista com TanStack Table e ações em massa — `feat(tasks): add list view`
- [ ] Calendário mensal — `feat(tasks): add calendar view`
- [ ] Minhas tarefas — `feat(tasks): add my tasks`
- [ ] Filtros e filtros salvos — `feat(tasks): add filters and saved filters`
- [ ] E2E: mover card, filtrar, seleção em massa — `test(e2e): cover board and list`

### Módulo 06 — Comentários, histórico, anexos e busca
- [ ] Comentários com Tiptap e @menção — `feat(tasks): add comments with mentions`
- [ ] Histórico na tarefa (pessoa, agente, automação) — `feat(tasks): add activity history`
- [ ] Anexos até 25 MB em volume local — `feat(tasks): add attachments`
- [ ] Busca ⌘K (título, `TI-`, `#GLPI`, `UM-`) com tsvector — `feat(search): add command palette search`
- [ ] SSE `/api/events` com heartbeat de 25 s — `feat(realtime): add server-sent events`

### Módulo 07 — Servidor MCP
- [ ] `/mcp` com SDK 1.32.1, autenticação por API key, rate limit 60/min — `feat(mcp): add mcp server`
- [ ] Ferramentas de `docs/API.md` sobre os services — `feat(mcp): add task tools`
- [ ] Configurações › Agentes e MCP (criar, exibir uma vez, revogar, atividade) — `feat(settings): add agents screen`
- [ ] Testes: token só-leitura não escreve; token revogado → 401; `create_task` sem project → `VALIDATION` — `test(mcp): cover permissions and validation`

### Módulo 08 — Notificações
- [ ] Worker pg-boss (`worker/index.ts`) e fila `notification.fanout` — `feat(jobs): add worker`
- [ ] Central de notificações e sino — `feat(notifications): add inbox`
- [ ] Web Push (VAPID, assinatura, teste, silêncio fora do expediente) — `feat(notifications): add web push`
- [ ] E-mail e resumo diário 08:00; lembrete de prazo e vencidas — `feat(notifications): add email digest and reminders`
- [ ] Preferências evento × canal — `feat(notifications): add preferences`

### Módulo 09 — Automações e templates
- [ ] Schema e `automationService` com proteção de laço (profundidade 3) — `feat(automation): add rules engine`
- [ ] Tela Automações + 6 regras iniciais — `feat(automation): add automations screen`
- [ ] Templates de tarefa e projeto — `feat(templates): add templates`

### Módulo 10 — Ciclos, marcos e painel
- [ ] Ciclos (um ativo, encerrar levando pendências) — `feat(planning): add cycles`
- [ ] Marcos — `feat(planning): add milestones`
- [ ] Painel por Projeto/Cliente com Chart do shadcn — `feat(planning): add project dashboard`

### Módulo 11 — PWA, mobile e acabamento
- [ ] Manifest, Serwist, splash iOS, prompt de instalação — `feat(pwa): add manifest and service worker`
- [ ] Telas mobile (Minhas, Kanban por coluna, detalhe, criar em painel) — `feat(mobile): add mobile layouts`
- [ ] Auditoria axe e contraste nos dois temas — `test(a11y): add accessibility checks`

### Módulo 12 — Migração e implantação
- [ ] Script de importação do Windshift com planilha de mapeamento — `feat(migration): add windshift import`
- [ ] `scripts/deploy.sh` (`git pull`, `docker compose up -d --build`, migrações no container, `/api/health`) e `deploy.yml` no GitHub Actions via SSH como `github-deploy`, no padrão do NoteScan; repositório em `/home/glpissh/docker/itc-tasks` (padrão `~/docker/<nome>` do servidor) (ADR-027, ADR-028) — `ci: add ssh deploy workflow`
- [ ] Rota `tasks.itcbr.xyz` no `itcbr-tunnel`, monitor no Uptime Kuma, item no Homepage — `docs: document production setup`
- [ ] Atualizar `guia-servidor-glpi-srv.md`, `contexto-glpi-srv.md` e `credenciais-glpi-srv.md` (projeto Infraestrutura - ITCBR) seguindo `novo-container-glpi-srv.md` — `docs: register itc tasks on glpi-srv
- [ ] Go-live e desligamento do Windshift — `docs: document module 12 deploy`

## Convenção de commits

| Tipo | Uso | Exemplo |
|---|---|---|
| `feat` | Funcionalidade | `feat(board): add kanban drag and drop` |
| `fix` | Correção | `fix(tasks): keep completedAt when moving between done statuses` |
| `security` | Segurança | `security(mcp): reject revoked api keys` |
| `refactor` | Sem mudar comportamento | `refactor(services): extract actor guard` |
| `test` | Testes | `test(mcp): cover read-only token` |
| `docs` | Documentação | `docs: document module 04 tasks core` |
| `chore` | Manutenção | `chore: bump next to 16.4.3` |
| `perf` | Desempenho | `perf(board): memoize task cards` |
| `ci` | Pipeline | `ci: add playwright workflow` |
| `style` | Formatação | `style: apply prettier` |
