# ITC Tasks — Progresso

## CURRENT STATE

> Sobrescrito a cada passagem de sessão. Não é registro permanente.

- **Fase:** Módulo 00 — Fundação concluído em 17/10/2026, na `develop`, aguardando revisão do Cowork.
- **Próximo passo:** Módulo 01 — Autenticação e membros, depois da aprovação.
- **Prontos:** Next 16.4.2 standalone, tokens do Design System, 10 componentes base em Base UI, Drizzle com a migração base, env tipado, Vitest/Playwright/ESLint/Prettier, CI (Quality Check + Gitleaks) verde no GitHub, Dockerfile e `docker-compose.yml` de produção, `/api/health`.
- **Pendente de decisão:** proteção da `main` não aplicada — o GitHub recusa branch protection em repositório privado no plano gratuito (HTTP 403).
- **Backup:** não definido por decisão de 17/10/2026 (`docs/INFRA.md` §9); migrações só aditivas até lá.
- **Pendências externas:** criar a caixa `tasks@itcbr.xyz` no Titan e
  conferir SPF/DKIM/DMARC do `itcbr.xyz`; adicionar a rota `tasks.itcbr.xyz` ao `itcbr-tunnel`.

## Registro

| Data | Módulo | Resumo |
|---|---|---|
| 2026-10-17 | 00 — Fundação | Scaffold Next 16.4.2, tokens, componentes Base UI, Drizzle + migração base, env, testes, CI, Docker, `/api/health`. ADR-032 (TS 7 + TS 6). Fora de ADR: `npm audit --omit=dev` no CI (`braces` sem correção nas ferramentas de dev); Gitleaks por imagem fixada por digest (a action exige licença em org); volume do Postgres 18 em `/var/lib/postgresql`; worker em perfil até o Módulo 08. Proteção da `main` bloqueada pelo plano do GitHub. Detalhes: `docs/modules/00-fundacao.md`. |
| 2026-10-17 | Pré-implementação | ADR-031: npm 11.19.1 (o do Node 24.22.0) no lugar do pnpm; `package-lock.json`, `npm ci` no CI e no Docker, `.npmrc` com `save-exact=true`. |
| 2026-10-17 | Pré-implementação | ADR-030: conversa Claude Code ↔ Cowork em `.conversa/` (fora do Git); repositório editado no Windows com `eol=lf`; o Cowork monta a pasta inicial (docs, marca em `public/` e `docs/brand/`, `.gitignore`, `.gitattributes`, `.conversa/`) e o Claude Code faz o commit inicial no Módulo 00. |
| 2026-10-17 | Pré-implementação | Documentação inicial: `documentacao-itc-tasks.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `docs/` (PRD, ARCHITECTURE, INFRA, DECISIONS com ADR-001 a ADR-029, SCHEMA, API, FLOWS, UI). Versões das dependências levantadas no npm em 17/10/2026. |
| 2026-10-17 | Pré-implementação | Telas do MVP no Claude Design (18 desktop, 4 mobile, sidebar expandida/recolhida, 4 referências no escuro, notificações e preferências). |
| 2026-10-16 | Pré-implementação | Design System ITC Tasks derivado do ITC Sentinel; marca "Concluído" no padrão ITC NoteScan; pacote de ícones PWA, favicon, splash iOS e Android. |
| 2026-10-16 | Pré-implementação | Escopo do MVP, campos ITC, MCP e stack definidos. |
