# ITC Tasks — Documentação técnica

> **Estado do projeto:** pré-implementação (17/10/2026). Nenhum código foi escrito ainda.
> Tudo o que descreve arquivos, rotas e tabelas é **planejado** e está marcado assim. Esta
> página é atualizada ao fim de cada módulo (ciclo descrito em `docs/PROGRESS.md`).

---

## 1. Visão geral

ITC Tasks é o gestor de tarefas do dia a dia do time de TI do Grupo ITC Brasil (4 pessoas).
Substitui o Windshift, instalado no servidor da ITC e abandonado por excesso de complexidade
(boards, portais, horas, testes e marcos ligados ao mesmo tempo). Não é portal de solicitações
nem de chamados: isso continua no GLPI. O ITC Tasks só referencia o chamado pelo número.

Três particularidades definem o produto:

- **Campos ITC em toda tarefa:** Projeto/Cliente (obrigatório, de cadastro prévio), Unidade
  Móvel (opcional, de cadastro prévio) e Chamado GLPI (número + link).
- **Operável por agentes:** um servidor MCP embutido permite que agentes (Claude e outros)
  listem, criem, atualizem e concluam tarefas com as mesmas regras da interface.
- **Acabamento de produto:** Design System próprio, modo claro/escuro, PWA instalável.

| Item | Valor |
|---|---|
| Cliente | Grupo ITC Brasil — time de TI |
| Responsável | Matheus Silva (matheus@grupoitcbrasil.com.br) |
| Usuários | 4 (papéis `admin` e `member`) + agentes via MCP |
| Hospedagem | `glpi-srv` (Dell PowerEdge R250, Ubuntu 24.04.4), `/home/glpissh/docker/itc-tasks`, exposto pelo túnel `itcbr-tunnel` já existente |
| Domínio | `https://tasks.itcbr.xyz` (Cloudflare Tunnel) |
| Repositório | `github.com/itc-brasil/itc-tasks` (CI com GitHub Actions) — **a criar** |
| GLPI | `http://glpi.grupoitcbrasil.com.br:8888` (só link, ADR-023) |
| E-mail | Titan Mail, domínio `@itcbr.xyz` (ADR-026) |

Requisitos de produto e critérios de aceite: `docs/PRD.md`.

---

## 2. Stack tecnológica

Versões levantadas no registro do npm e nas fontes oficiais em **17/10/2026** (`npm view <pkg> version`).
Não há `package.json` ainda: ao criar o projeto, fixar exatamente estas versões e, a partir daí,
**esta tabela passa a ser lida do `package.json`**.

### Runtime e infraestrutura

| Tecnologia | Versão | Papel |
|---|---|---|
| Node.js | 24.22.0 LTS "Krypton" | Runtime (imagem `node:24-alpine`) |
| npm | 11.19.1 (vem com o Node 24.22.0) | Gerenciador de pacotes, `package-lock.json` (ADR-031) |
| PostgreSQL | 18.6 | Banco único: dados, sessões, fila de jobs, busca |
| cloudflared | já instalado no host (serviço systemd, `itcbr-tunnel`) | Publica `tasks.itcbr.xyz` → `localhost:3021` (ADR-028) |
| Docker | 29.5.3 (host `glpi-srv`) | Orquestração `app`, `worker`, `db` |

### Aplicação

| Pacote | Versão | Papel |
|---|---|---|
| `next` | 16.4.2 | Framework (App Router, Server Components, Server Actions) |
| `react` / `react-dom` | 19.3.1 | UI |
| `typescript` | 7.0.2 | Tipagem |
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.3 | Estilo; tokens via `@theme` |
| `shadcn` (CLI) | 4.22.0 | Gera os componentes no repositório |
| `@base-ui/react` | 1.9.0 | Primitivos acessíveis sob o shadcn (padrão ITC, ADR-002) |
| `class-variance-authority` / `tailwind-merge` / `clsx` | 0.7.1 / 3.7.0 / 2.1.1 | Variantes e merge de classes |
| `tw-animate-css` | 1.4.0 | Animações utilitárias do shadcn |
| `lucide-react` | 1.58.0 | Ícones (ADR-012) |
| `next-themes` | 0.4.6 | Tema claro/escuro, sem modo sistema (ADR-013) |
| `@tanstack/react-query` | 5.104.3 | Cache no cliente e atualização otimista |
| `@tanstack/react-table` | 9.3.1 | Visão Lista |
| `@dnd-kit/react` | 0.5.1 | Arrastar cards no Kanban (ADR-014) |
| `cmdk` | 1.1.1 | Paleta ⌘K |
| `motion` | 14.3.0 | Microinterações |
| `@tiptap/react` / `@tiptap/starter-kit` / `@tiptap/pm` | 3.32.0 | Editor de descrição e comentários |
| `recharts` | 3.10.1 | Gráficos do Painel via componente Chart do shadcn (ADR-015) |
| `sonner` | 2.0.8 | Toasts |
| `react-hook-form` / `@hookform/resolvers` | 7.90.0 / 5.9.1 | Formulários |
| `date-fns` | 4.4.0 | Datas (`pt-BR`) |

### Dados, validação e servidor

| Pacote | Versão | Papel |
|---|---|---|
| `drizzle-orm` | 0.45.4 | ORM (ADR-004) |
| `drizzle-kit` | 0.31.11 | Migrações |
| `drizzle-zod` | 0.8.3 | Schemas Zod a partir das tabelas — **verificar compatibilidade com Zod 4.6 no scaffold** |
| `pg` | 8.23.1 | Driver PostgreSQL, compartilhado por Drizzle e pg-boss (ADR-005) |
| `zod` | 4.6.7 | Validação única: formulários, actions, MCP, env (ADR-006) |
| `@t3-oss/env-nextjs` | 0.13.11 | Variáveis de ambiente tipadas |
| `better-auth` | 1.7.10 | Autenticação, sessões, admin e API keys (ADR-007) |
| `@node-rs/argon2` | 2.2.2 | Hash de senha Argon2id (ADR-008) |
| `@modelcontextprotocol/sdk` | 1.32.1 | Servidor MCP, transporte Streamable HTTP (ADR-009) |
| `pg-boss` | 12.38.0 | Fila de jobs: automações, notificações, lembretes (ADR-010) |
| `web-push` | 3.6.7 | Web Push com VAPID (ADR-017) |
| `nodemailer` | 10.1.2 | E-mail (SMTP) |
| `pino` | 10.4.0 | Logs estruturados |
| `@serwist/next` / `@serwist/turbopack` / `serwist` | 9.5.13 | Service worker do PWA (ADR-016) |

### Qualidade

| Pacote | Versão | Papel |
|---|---|---|
| `vitest` | 5.0.5 | Testes unitários e de integração |
| `@playwright/test` | 1.64.1 | E2E |
| `@axe-core/playwright` | 4.14.0 | Acessibilidade nas telas principais |
| `eslint` | 10.13.0 | Lint |
| `prettier` | 3.9.10 | Formatação |

Dois pontos de atenção de versão: `@dnd-kit/react` ainda é 0.x (ADR-014) e `typescript` 7 é a
reescrita nativa — se algum plugin de lint ou o Next acusar incompatibilidade no scaffold,
registrar em ADR antes de rebaixar.

---

## 3. Estrutura de pastas (planejada)

```
itc-tasks/
├── .conversa/                     ← mensagens Claude Code ↔ Cowork, fora do Git (ADR-030)
├── .gitattributes                 ← eol=lf (edição no Windows, execução no Linux)
├── CLAUDE.md                      ← contexto permanente do Claude Code
├── PROMPT_CLAUDE_CODE.md          ← prompt de início + plano de módulos
├── documentacao-itc-tasks.md      ← este arquivo
├── docker-compose.yml             ← produção: app, worker, db
├── docker-compose.dev.yml         ← desenvolvimento: db (+ mailpit)
├── Dockerfile
├── drizzle.config.ts
├── docs/                          ← PRD, ARCHITECTURE, INFRA, DECISIONS, SCHEMA, API, FLOWS, UI, PROGRESS, modules/, brand/
├── public/
│   ├── icons/                     ← do pacote itc-tasks-identidade.zip (pwa/)
│   ├── splash/                    ← splash screens iOS
│   ├── favicon.ico, favicon.svg
├── src/
│   ├── app/
│   │   ├── (auth)/login/          ← Entrar
│   │   ├── (app)/                 ← layout com sidebar; todas as telas autenticadas
│   │   │   ├── page.tsx           ← Minhas tarefas
│   │   │   ├── tarefas/           ← kanban | lista | calendario | [number]
│   │   │   ├── ciclos/  marcos/  painel/  templates/  notificacoes/
│   │   │   └── config/            ← projetos, unidades-moveis, automacoes, workflow, etiquetas, membros, agentes, preferencias
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts   ← Better Auth
│   │   │   ├── events/route.ts          ← SSE (notificações e atualizações de board)
│   │   │   ├── push/subscribe/route.ts
│   │   │   ├── attachments/[id]/route.ts
│   │   │   └── health/route.ts
│   │   ├── mcp/route.ts           ← servidor MCP (Streamable HTTP)
│   │   ├── manifest.ts            ← Web App Manifest
│   │   └── sw.ts                  ← service worker (Serwist)
│   ├── components/
│   │   ├── ui/                    ← gerados pelo shadcn (Base UI)
│   │   └── tasks/ board/ layout/  ← componentes do Design System ITC Tasks
│   ├── server/
│   │   ├── services/              ← CAMADA ÚNICA DE REGRAS (UI e MCP chamam aqui)
│   │   ├── actions/               ← Server Actions finas que chamam services
│   │   ├── mcp/                   ← definição das ferramentas MCP
│   │   ├── jobs/                  ← handlers do pg-boss
│   │   └── auth.ts                ← configuração do Better Auth
│   ├── db/
│   │   ├── schema/                ← tabelas Drizzle, um arquivo por domínio
│   │   ├── migrations/
│   │   └── index.ts               ← pool `pg` + instância Drizzle
│   ├── lib/
│   │   ├── validation/            ← schemas Zod compartilhados
│   │   └── env.ts                 ← @t3-oss/env-nextjs
│   └── styles/globals.css         ← tokens do Design System (@theme)
├── worker/index.ts                ← processo do pg-boss (mesma imagem, outro comando)
└── tests/  e2e/
```

---

## 4. Schema do banco (planejado)

### Fonte da verdade

**Fonte da verdade:** o PostgreSQL 18 (volume `db-data`) e a pasta de anexos (volume
`uploads`). São os dois que um backup futuro precisa cobrir (hoje não há backup definido). **Não há índice reconstruível separado**: a busca usa
uma coluna `tsvector` gerada (`tasks.search`), mantida pelo próprio Postgres. O schema do
pg-boss (`pgboss.*`) é gerido pela biblioteca e também é estado da aplicação.

Todas as tabelas são classe ② (estado da aplicação). Diagrama ER e o código Drizzle completo:
`docs/SCHEMA.md`.

| Tabela | Classe | Responsabilidade |
|---|---|---|
| `user`, `session`, `account`, `verification` | ② | Better Auth. `user` ganha `role`, `initials`, `theme`, `sidebarCollapsed`, `quietHoursStart/End`, `emailDigest` |
| `apikey` | ② | Plugin API Key do Better Auth: tokens dos agentes MCP, guardados só como hash |
| `projects` | ② | Projetos/Clientes. `code` único (2–4 letras), `kind` (`client`/`internal`), `archivedAt` |
| `mobile_units` | ② | Unidades Móveis. `code` único (`UM-07`), modelo, placa, base, cliente, `archivedAt` |
| `workflow_statuses` | ② | Status configuráveis, cada um com `category` fixa (`backlog`/`todo`/`in_progress`/`done`) |
| `tasks` | ② | Tarefa. `number` sequencial (exibido `TI-142`), `projectId` **NOT NULL**, `mobileUnitId`, `glpiTicket`, `priority`, `position` (ordem no board), `createdVia`, `search` (tsvector gerado) |
| `checklist_items` | ② | "Subtarefas" da UI: itens marcáveis com responsável opcional (ADR-019) |
| `task_links` | ② | Vínculos `blocks` / `relates` entre tarefas |
| `labels`, `task_labels` | ② | Etiquetas com cor de token |
| `comments` | ② | Comentários (Tiptap JSON + texto plano), autor pessoa ou agente |
| `task_events` | ② | Histórico imutável: quem (pessoa/agente/automação/sistema), o quê, quando |
| `attachments` | ② | Metadados; o arquivo fica em `/data/uploads/<uuid>` |
| `cycles` | ② | Ciclos (`planned`/`active`/`closed`), um ativo por vez |
| `milestones` | ② | Marcos com prazo e Projeto/Cliente |
| `templates` | ② | Templates de tarefa/projeto (`payload` JSON validado por Zod) |
| `automation_rules`, `automation_runs` | ② | Regras gatilho → condição → ação e o log de execuções |
| `saved_filters` | ② | Filtros salvos por usuário |
| `notifications` | ② | Central de notificações por usuário (`readAt`) |
| `notification_preferences` | ② | Evento × canal (`inApp`, `push`, `email`) por usuário |
| `push_subscriptions` | ② | Endpoints Web Push por dispositivo |

**Regras de integridade que não podem ser violadas** (garantidas no banco **e** nos services):

- `tasks.project_id` é `NOT NULL` com FK para `projects`; o service recusa projeto arquivado.
- Cadastros (`projects`, `mobile_units`, `workflow_statuses`, `labels`) nunca são apagados:
  `archivedAt` os tira dos seletores e preserva o histórico (ADR-018).
- `task_events` é só-inserção.

**Seed (planejado, `src/db/seed.ts`):** status padrão (Backlog, A fazer, Em andamento,
Concluído), prioridades, preferências de notificação padrão e o primeiro usuário admin
lido de `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`.

---

## 5. Autenticação e autorização (planejado)

Biblioteca: Better Auth 1.7.10, configuração em `src/server/auth.ts`, rotas em
`src/app/api/auth/[...all]/route.ts`.

- **Login:** e-mail e senha. Sem cadastro público: `disableSignUp: true`; o admin cria as
  contas (plugin `admin`). Login com Google Workspace fica fora do MVP.
- **Senha:** Argon2id via `@node-rs/argon2` em `emailAndPassword.password.hash/verify`
  (substitui o scrypt padrão — ADR-008).
- **Sessão:** cookie HTTP-only, `Secure`, `SameSite=Lax`. Duração e renovação: 30 dias com
  renovação diária (`expiresIn`/`updateAge`) — valor a confirmar no Módulo 01.
- **Agentes:** plugin `apiKey`. Token exibido uma vez, guardado como hash, com permissões
  (`tasks:read`, `tasks:write`) e dono. Revogável na tela Configurações › Agentes e MCP.
- **Papéis:**

| Papel | Pode |
|---|---|
| `admin` | Tudo, incluindo membros, workflow, cadastros, automações e tokens de qualquer pessoa |
| `member` | Tarefas, ciclos, marcos, comentários, templates, os próprios tokens e preferências |
| Agente (token) | Somente as ferramentas MCP liberadas pelas permissões do token, agindo **em nome do dono** |

**Regra crítica:** toda escrita passa por `src/server/services/*`, que recebe um `Actor`
(`{ kind: 'user' | 'agent' | 'automation' | 'system', userId, apiKeyId? }`) e verifica
permissão e regras de domínio no servidor. Proteção de rotas da UI no layout `(app)` e em cada
action; checagens no cliente são só de interface.

---

## 6. Módulos implementados

**Módulo 00 — Fundação (17/10/2026).** Next.js 16.4.2 (App Router, `output: "standalone"`, `cacheComponents`) com TypeScript 7.0.2 como compilador e TS 6.0.2 só para o typescript-eslint (ADR-032). Tokens do Design System em `src/styles/globals.css` mapeados por namespace do Tailwind 4.3.3 (`bg-muted` ≠ `text-muted`, `text-base` é cor), Inter e Archivo por `next/font`, e dez componentes shadcn 4.22.0 sobre `@base-ui/react` 1.9.0 restilizados (`src/components/ui/`). Drizzle 0.45.4 com `pg`, migração custom `drizzle/0000_base.sql` (`unaccent`, `unaccent_immutable`, `task_number_seq`), Postgres 18.6 e Mailpit no `docker-compose.dev.yml` (porta 5435) e banco `itc_tasks_test` criado no init. `src/lib/env.ts` valida o ambiente com `@t3-oss/env-nextjs`. Vitest 5.0.5 (projetos `unit` e `integration`, este travado em `itc_tasks_test`), Playwright 1.64.1 com axe, ESLint 10 com `eslint-plugin-security`, Prettier. CI `Quality Check` e Gitleaks verdes no GitHub, ações fixadas por SHA, Dependabot minor/patch. Produção: `Dockerfile` em `node:24.22.0-alpine`, entrypoint que aplica as migrações com o migrator do `drizzle-orm` antes do `server.js`, `docker-compose.yml` no padrão do `glpi-srv` e `/api/health` (200/503). A proteção da `main` ficou pendente: o plano gratuito do GitHub não a permite em repositório privado. Details: docs/modules/00-fundacao.md

**Módulo 01 — Autenticação e membros (17/10/2026).** `src/server/auth.ts` configura Better Auth 1.7.10 com Drizzle, `disableSignUp`, senha mínima de 12, hash Argon2id pelo `@node-rs/argon2` 2.2.2 (`memoryCost 19456`, `timeCost 2`), `trustedOrigins` com `https://tasks.itcbr.xyz`, plugins `admin` (papéis `admin` e `member`, ADR-037), `apiKey` do pacote `@better-auth/api-key` (prefixo `itct_`, 60 req/min) e `nextCookies`, mais os campos de preferência do usuário (`initials`, `theme`, `sidebarCollapsed`, horário de silêncio, `emailDigest`). O schema `src/db/schema/auth.ts` sai do CLI `auth` e as migrações `0001_auth` e `0002_user_preferences` são aditivas. `src/proxy.ts` manda quem não tem cookie para `/login`; `requireActor()` em `src/server/actor.ts` valida a sessão, recusa banidos e devolve o `Actor`. A tela Entrar usa o cliente do Better Auth, e Configurações › Membros (`/config/membros`) cria membros, troca papel e desativa por ban, sempre pelo `membersService` com `assertAdmin`; ninguém altera a própria conta. `src/db/seed.mjs` cria o primeiro admin de forma idempotente, no dev e na imagem (`dist/seed.mjs`). Testes de integração cobrem login, cadastro bloqueado, desativação e permissões; E2E cobre rota protegida, erro de login e Membros com axe. Details: docs/modules/01-autenticacao.md

**Módulo 02 — Layout, navegação e tema (17/10/2026).** `src/components/layout/app-shell.tsx` envolve o grupo `(app)`: sidebar de 236 px ou trilho de 64 px a partir de 1024 px, com o estado inicial lido de `user.sidebarCollapsed` no servidor e alternado por `[` ou pelo botão "Recolher menu"; entre 768 e 1023 px fica o trilho e a expansão sobrepõe o conteúdo sem mudar a preferência; abaixo de 768 px aparece a barra inferior. A navegação (`nav.ts`) só lista telas que existem. O tema usa `next-themes` no layout raiz (`data-theme`, só claro e escuro) e o shell corrige o tema do aparelho a partir de `user.theme`, porque o layout raiz é estático com `cacheComponents` (ADR-038). Preferências passam por `preferencesService` com o próprio actor; `requireUser()` devolve actor e perfil. `useShortcut` ignora campos de texto e o diálogo `?` lista os atalhos ativos. Estados padrão: EmptyState, Skeleton, Avatar, `loading.tsx`, `error.tsx` e `not-found.tsx`. O axe no escuro levou ao ADR-039 (`accent-text` `#46B5BA` e token `on-err`). Details: docs/modules/02-layout.md

Plano de módulos (`PROMPT_CLAUDE_CODE.md`):

| Nº | Módulo | Status |
|---|---|---|
| 00 | Fundação (scaffold, Docker, DB, tokens, CI) | Concluído (17/10/2026) |
| 01 | Autenticação e membros | Concluído (17/10/2026) |
| 02 | Layout, navegação e tema | Em revisão (17/10/2026) |
| 03 | Cadastros (Projetos/Clientes, UMs, workflow, etiquetas) | Planejado |
| 04 | Tarefas: núcleo, detalhe e criação rápida | Planejado |
| 05 | Visões: Kanban, Lista, Calendário, Minhas tarefas, filtros | Planejado |
| 06 | Comentários, histórico, anexos e busca ⌘K | Planejado |
| 07 | Servidor MCP e tokens de agentes | Planejado |
| 08 | Notificações (in-app, push, e-mail) | Planejado |
| 09 | Automações e templates | Planejado |
| 10 | Ciclos, marcos e painel | Planejado |
| 11 | PWA, mobile e acabamento | Planejado |
| 12 | Migração do Windshift e implantação | Planejado |

Cada módulo concluído ganha aqui um parágrafo denso terminado em
`Details: docs/modules/NN-name.md`.

---

## 7. Identidade visual e Design System

- **Design System (referência viva):** https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495 —
  derivado do ITC Sentinel. Tokens em `tokens.json`; no código vão para
  `src/styles/globals.css` (`@theme` do Tailwind 4) com o mapeamento para as variáveis do shadcn.
- **Telas (Claude Design):** https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9 — 18 telas desktop,
  4 mobile, sidebar expandida/recolhida, referências em modo escuro.
- **Marca:** identidade "Concluído" (anel ciano `#008F95` + check `#003C3F`; escuro `#30A5AB` +
  `#F5F0E8`), lockup no padrão do ITC NoteScan. Especificação:
  https://claude.ai/artifact/RqMzGQZjWNoxSUmRkpMqfs. Arquivos: `public/brand/`, `public/icons/`, `public/splash/` e a especificação em `docs/brand/`.
- **Tokens principais:**

| Token | Claro | Escuro |
|---|---|---|
| `--bg-base` | `#F5F0E8` | `#141918` |
| `--bg-surface` | `#FDFBF7` | `#1E2422` |
| `--bg-muted` | `#EBE4D8` | `#2A302E` |
| `--border` | `#D8DEDE` | `#333B39` |
| `--text-base` / `--text-muted` | `#1A2020` / `#636C6C` (ADR-035) | `#F4F6F6` / `#8E9A98` |
| `--accent` | `#008F95` | `#30A5AB` |
| `--accent-text` | `#006C72` | `#30A5AB` |
| `--accent-solid` / `-hover` (fundo com `on-accent`, ADR-035) | `#007A80` / `#006C72` | `#30A5AB` / `#46B5BA` |
| `--on-accent` | `#FFFFFF` | `#08201F` |
| `--ok` `--warn` `--err` `--info` | `#1A7F3C` `#CC7A00` `#C0392B` `#1565C0` | `#3DA35D` `#D98E2B` `#D75A4A` `#4B93DB` |
| `--sev-medium` | `#C9A227` | `#C9A227` |

- **Tipografia:** Inter (400–800) em toda a UI, dados técnicos com `tabular-nums`; Archivo
  600/800 só no lockup.
- **Tema:** apenas claro e escuro, padrão claro, escolha salva no usuário (ADR-013).
- Regras de interação, estados e responsivo: `docs/UI.md`.

---

## 8. Integrações com IA

O app **não chama modelos de IA** no MVP. A integração é inversa: agentes externos operam o
app pelo servidor MCP em `/mcp` (ADR-009). Contrato completo das ferramentas: `docs/API.md`.

| Ferramenta MCP | Permissão |
|---|---|
| `list_tasks`, `get_task`, `list_projects`, `list_mobile_units`, `list_cycles` | `tasks:read` |
| `create_task`, `update_task`, `complete_task`, `add_comment` | `tasks:write` |

Custo: zero no servidor. O custo de modelo é de quem opera o agente.

---

## 9. Segurança (planejado)

- **Validação:** todo input (form, action, MCP, query string) passa por Zod no servidor.
- **Rate limit:** embutido do Better Auth nas rotas de auth; limite por token no `/mcp`
  (60 req/min por chave — valor inicial, ADR-009).
- **Tokens de agente:** só hash no banco, permissão mínima, auditoria em `task_events` com
  `apiKeyId`, revogação imediata.
- **Uploads:** máximo 25 MB por arquivo (abaixo do limite de 100 MB do Cloudflare Tunnel),
  tipo verificado por assinatura, servidos por rota autenticada com `Content-Disposition`.
- **Cabeçalhos:** CSP estrita, `X-Content-Type-Options`, `Referrer-Policy` em `next.config.ts`.
- **CI:** `eslint-plugin-security`, Gitleaks, `npm audit --audit-level=high` e Dependabot (minor/patch). CodeQL fica de fora: o GitHub Advanced Security não está disponível no plano gratuito para repositórios privados da org ITC-Brasil (verificado no NoteScan) — ADR-029.
- **Superfícies com teste dedicado (planejados):** criação de tarefa sem Projeto/Cliente via
  UI e via MCP; token revogado; token só-leitura tentando escrever; acesso a anexo sem sessão.

---

## 10. Infraestrutura e deploy (planejado)

Detalhes do servidor, túnel, deploy e checklist de implantação: `docs/INFRA.md`.

- **Local:** `docker compose -f docker-compose.dev.yml up -d` (Postgres 18 + Mailpit),
  `npm run db:migrate`, `npm run db:seed`, `npm run dev`.
- **Produção:** `glpi-srv`, pasta `/home/glpissh/docker/itc-tasks` (padrão `~/docker/<nome>` do servidor), três serviços:
  `app` (Next standalone, porta `127.0.0.1:3021`), `worker` (pg-boss) e `db` (Postgres 18.6,
  sem porta no host). O túnel `itcbr-tunnel` (cloudflared no host, `/etc/cloudflared/config.yml`)
  ganha a rota `tasks.itcbr.xyz → http://localhost:3021` (ADR-028).
- **Restrições do Cloudflare Tunnel que viram arquitetura:** ver `docs/ARCHITECTURE.md`
  (timeout de ~100 s, upload de 100 MB, conexões SSE com heartbeat).
- **Backup:** não definido no MVP (decisão de 17/10/2026). Enquanto isso, migrações só aditivas — `docs/INFRA.md` §9.

---

## 11. Git e versionamento

- Mesmo fluxo do NoteScan: `feat/…` → PR para `develop` → PR `develop → main` com CI verde e 1 aprovação; push direto na `main` bloqueado por disciplina e pelo hook `.githooks/pre-push` (ADR-034). Merge na `main` dispara o deploy (ADR-029).
- Conventional Commits: `type(scope): descrição` (tabela em `CLAUDE.md`).
- Hooks de pre-commit (planejado): lint + typecheck dos arquivos alterados.

---

## 12. CI/CD (planejado para o Módulo 00)

GitHub Actions, ações fixadas por SHA completo:

- `ci.yml` — em PR e push: `npm ci`, lint, typecheck, Vitest com
  Postgres 18 como serviço, build.
- `e2e.yml` — Playwright + axe nas telas principais.
- `security.yml` — Gitleaks e `npm audit --audit-level=high` (sem CodeQL, ADR-029).
- `deploy.yml` — em push na `main`, conecta por SSH no `glpi-srv` como `github-deploy` (mesmo
  padrão do Diario Monitor) e roda `scripts/deploy.sh`: `git pull`, `docker compose up -d --build`,
  migrações e checagem do `/api/health`. **Sem registry de imagens** (ADR-027).
