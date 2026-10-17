# ITC Tasks — Progresso

## CURRENT STATE

> Sobrescrito a cada passagem de sessão. Não é registro permanente.

- **Fase:** pré-implementação concluída (17/10/2026). Nenhum código escrito.
- **Próximo passo:** Módulo 00 — Fundação (`PROMPT_CLAUDE_CODE.md`).
- **Prontos:** PRD, arquitetura, 31 ADRs, schema planejado, contrato MCP, fluxos, guia de UI,
  Design System, telas, marca e pacote PWA.
- **Definido em 17/10/2026:** domínio `tasks.itcbr.xyz`, GLPI `http://glpi.grupoitcbrasil.com.br:8888`,
  e-mail Titan Mail em `@itcbr.xyz` (ADR-026), GitHub `itc-brasil/itc-tasks`, sem registry de imagens (ADR-027); produção no `glpi-srv` com o túnel `itcbr-tunnel` existente, porta `127.0.0.1:3021` (ADR-028); fluxo de Git, CI e deploy igual ao do NoteScan (ADR-029).
- **Backup:** não definido por decisão de 17/10/2026 (`docs/INFRA.md` §9); migrações só aditivas até lá.
- **Pendências externas:** criar a caixa `tasks@itcbr.xyz` no Titan e
  conferir SPF/DKIM/DMARC do `itcbr.xyz`; adicionar a rota `tasks.itcbr.xyz` ao `itcbr-tunnel`.

## Registro

| Data | Módulo | Resumo |
|---|---|---|
| 2026-10-17 | Pré-implementação | ADR-031: npm 11.19.1 (o do Node 24.22.0) no lugar do pnpm; `package-lock.json`, `npm ci` no CI e no Docker, `.npmrc` com `save-exact=true`. |
| 2026-10-17 | Pré-implementação | ADR-030: conversa Claude Code ↔ Cowork em `.conversa/` (fora do Git); repositório editado no Windows com `eol=lf`; o Cowork monta a pasta inicial (docs, marca em `public/` e `docs/brand/`, `.gitignore`, `.gitattributes`, `.conversa/`) e o Claude Code faz o commit inicial no Módulo 00. |
| 2026-10-17 | Pré-implementação | Documentação inicial: `documentacao-itc-tasks.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `docs/` (PRD, ARCHITECTURE, INFRA, DECISIONS com ADR-001 a ADR-029, SCHEMA, API, FLOWS, UI). Versões das dependências levantadas no npm em 17/10/2026. |
| 2026-10-17 | Pré-implementação | Telas do MVP no Claude Design (18 desktop, 4 mobile, sidebar expandida/recolhida, 4 referências no escuro, notificações e preferências). |
| 2026-10-16 | Pré-implementação | Design System ITC Tasks derivado do ITC Sentinel; marca "Concluído" no padrão ITC NoteScan; pacote de ícones PWA, favicon, splash iOS e Android. |
| 2026-10-16 | Pré-implementação | Escopo do MVP, campos ITC, MCP e stack definidos. |
