# ITC Tasks — Progresso

## CURRENT STATE

> Sobrescrito a cada passagem de sessão. Não é registro permanente.

- **Fase:** Módulo 03 — Cadastros, ajustes da M-018 aplicados em 17/10/2026, na `develop`. Módulos 00 a 02 na `main` (PRs #1 e #2).
- **Próximo passo:** revisão do Cowork; depois, Módulo 04 — Tarefas: núcleo.
- **Prontos:** Next 16.4.2 standalone, tokens do Design System, 10 componentes base em Base UI, Drizzle com a migração base, env tipado, Vitest/Playwright/ESLint/Prettier, CI (Quality Check + Gitleaks) verde no GitHub, Dockerfile e `docker-compose.yml` de produção, `/api/health`; Better Auth com Argon2id, tela Entrar, `requireActor()`, seed do admin (`npm run db:seed`), Configurações › Membros; shell com sidebar/trilho/barra inferior, tema claro/escuro salvo no usuário, atalhos `[` e `?`, estados vazio/carregando/erro; cadastros (Projetos/Clientes, UMs, Workflow, Etiquetas) com arquivamento.
- **Proteção da `main`:** por disciplina e hook local (ADR-034); depois de clonar, `git config core.hooksPath .githooks`.
- **Backup:** não definido por decisão de 17/10/2026 (`docs/INFRA.md` §9); migrações só aditivas até lá.
- **Pendências externas:** criar a caixa `tasks@itcbr.xyz` no Titan e
  conferir SPF/DKIM/DMARC do `itcbr.xyz`; adicionar a rota `tasks.itcbr.xyz` ao `itcbr-tunnel`.

## Registro

| Data | Módulo | Resumo |
|---|---|---|
| 2026-10-17 | 03 — Revisão | Ajustes de M-018: paleta própria das etiquetas (ADR-041, 7 tokens `--label-*`, migração `0004_label_palette` que só renomeia o token); seed de etiquetas só com a tabela vazia; `seed.mjs` regravado com LF. Decisões do Matheus: categoria do status imutável; cadastros só para admin. Processo: ADR antes do código a partir do Módulo 04. |
| 2026-10-17 | 03 — Cadastros | `catalog.ts` + `0003_catalog`; seed de status, etiquetas e "A classificar"; `catalogService`; telas em `/config/*` com abas. ADR-040 (normalização, categoria fixa, um status ativo por categoria), escrito no fechamento, depois do código. Detalhes: `docs/modules/03-cadastros.md`. |
| 2026-10-17 | 02 — Revisão | Ajustes de M-014: falha ao salvar preferência desfaz a mudança e mostra toast (`savePreference`); `Esc` fecha a sidebar sobreposta no tablet e devolve o foco. Decisões do Matheus: "Criar tarefa" desabilitado até o Módulo 04; Configurações só para admin até existir "Minhas preferências". |
| 2026-10-17 | 02 — Layout, navegação e tema | Shell (`src/components/layout/`): sidebar 236/64 px salva em `user.sidebarCollapsed`, sobreposta em 768–1023 px, barra inferior < 768 px; `next-themes` com sincronização de `user.theme` (ADR-038); `useShortcut` + diálogo `?`; EmptyState, Skeleton, Avatar, `loading`/`error`/`not-found`; contraste do escuro (ADR-039). As três primeiras tarefas do módulo saíram num só commit (o shell, o tema e os atalhos dependem um do outro). Detalhes: `docs/modules/02-layout.md`. |
| 2026-10-17 | 01 — Revisão | Ajustes de M-007: redefinir senha pelo admin (encerra sessões), `MemberError` para membro inexistente e para e-mail duplicado em corrida, IP do cliente por `cf-connecting-ip`/`x-forwarded-for` no rate limit. E2E fora do CI até o Módulo 11 (aceito na M-007); os testes de integração de auth rodam no Quality Check (`npm run test:coverage`). |
| 2026-10-17 | 01 — Autenticação e membros | Better Auth 1.7.10 (`admin`, `@better-auth/api-key`, `nextCookies`) com Argon2id; schema gerado pelo CLI `auth` (`0001_auth`, `0002_user_preferences`); `src/proxy.ts` + `requireActor()`; tela Entrar; `src/db/seed.mjs`; Membros (criar, trocar papel, desativar por ban). ADR-037. Ajuste M-005: `--accent-solid-pressed`. Detalhes: `docs/modules/01-autenticacao.md`. |
| 2026-10-17 | 00 — Revisão | Ajustes de M-002/M-003: ADR-033 (audit só de produção, Gitleaks por imagem), ADR-034 (`main` por disciplina + `.githooks/pre-push`), ADR-035 (`text-muted` `#636C6C`, `accent-solid` `#007A80`, axe `color-contrast` religado), ADR-036 (`cacheComponents`/`partialPrefetching`); nota do Postgres 18 no `docs/INFRA.md` §3; `.claude/launch.json` versionado. |
| 2026-10-17 | 00 — Fundação | Scaffold Next 16.4.2, tokens, componentes Base UI, Drizzle + migração base, env, testes, CI, Docker, `/api/health`. ADR-032 (TS 7 + TS 6). Fora de ADR: `npm audit --omit=dev` no CI (`braces` sem correção nas ferramentas de dev); Gitleaks por imagem fixada por digest (a action exige licença em org); volume do Postgres 18 em `/var/lib/postgresql`; worker em perfil até o Módulo 08. Proteção da `main` bloqueada pelo plano do GitHub. Detalhes: `docs/modules/00-fundacao.md`. |
| 2026-10-17 | Pré-implementação | ADR-031: npm 11.19.1 (o do Node 24.22.0) no lugar do pnpm; `package-lock.json`, `npm ci` no CI e no Docker, `.npmrc` com `save-exact=true`. |
| 2026-10-17 | Pré-implementação | ADR-030: conversa Claude Code ↔ Cowork em `.conversa/` (fora do Git); repositório editado no Windows com `eol=lf`; o Cowork monta a pasta inicial (docs, marca em `public/` e `docs/brand/`, `.gitignore`, `.gitattributes`, `.conversa/`) e o Claude Code faz o commit inicial no Módulo 00. |
| 2026-10-17 | Pré-implementação | Documentação inicial: `documentacao-itc-tasks.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `docs/` (PRD, ARCHITECTURE, INFRA, DECISIONS com ADR-001 a ADR-029, SCHEMA, API, FLOWS, UI). Versões das dependências levantadas no npm em 17/10/2026. |
| 2026-10-17 | Pré-implementação | Telas do MVP no Claude Design (18 desktop, 4 mobile, sidebar expandida/recolhida, 4 referências no escuro, notificações e preferências). |
| 2026-10-16 | Pré-implementação | Design System ITC Tasks derivado do ITC Sentinel; marca "Concluído" no padrão ITC NoteScan; pacote de ícones PWA, favicon, splash iOS e Android. |
| 2026-10-16 | Pré-implementação | Escopo do MVP, campos ITC, MCP e stack definidos. |
