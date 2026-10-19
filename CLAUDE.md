# CLAUDE.md — ITC Tasks

ITC Tasks é o gestor de tarefas do dia a dia do time de TI do Grupo ITC Brasil (4 pessoas),
substituto do Windshift. Toda tarefa tem Projeto/Cliente (obrigatório), Unidade Móvel e
Chamado GLPI (opcionais), e agentes operam o app por um servidor MCP embutido em `/mcp`.

**Estado:** Módulos 00 a 11 na `main`; produção no ar em `https://tasks.itcbr.xyz` desde 18/10/2026. Módulo 12 (migração do Windshift e implantação) em revisão em 18/10/2026; o merge dele liga o deploy automático.

## Stack (versões exatas — após o scaffold, a fonte é o `package.json`)

| Camada | Versão |
|---|---|
| Node / npm | 24.22.0 LTS / 11.19.1 (o que vem com o Node; nunca pnpm nem yarn — ADR-031) |
| Next.js / React / TypeScript | 16.4.2 / 19.3.1 / 7.0.2 (`@typescript/native`; `typescript` = TS 6.0.2 para o typescript-eslint — ADR-032) |
| Tailwind / shadcn / Base UI | 4.3.3 / 4.22.0 / `@base-ui/react` 1.9.0 |
| PostgreSQL / Drizzle / drizzle-kit / pg | 18.6 / 0.45.4 / 0.31.11 / 8.23.1 |
| Zod | 4.6.7 |
| Better Auth / Argon2 | 1.7.10 / `@node-rs/argon2` 2.2.2 |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.1 |
| pg-boss | 12.38.0 |
| TanStack Query / Table | 5.104.3 / 9.3.1 |
| dnd-kit / cmdk / Tiptap / Recharts | `@dnd-kit/react` 0.5.1 / 1.1.1 / 3.32.0 / 3.10.1 |
| lucide-react / next-themes / motion / sonner | 1.58.0 / 0.4.6 / 14.3.0 / 2.0.8 |
| Service worker / web-push / nodemailer | próprio em `public/sw.js` (ADR-054) / 3.6.7 / 10.1.2 |
| Vitest / Playwright | 5.0.5 / 1.64.1 |

## Regras invioláveis

- **Toda escrita passa por `src/server/services/`** com um `Actor` (`user` | `agent` | `automation` | `system`). Server Actions e ferramentas MCP só validam, chamam o service e mapeiam erros (ADR-003).
- **Projeto/Cliente é obrigatório** em toda tarefa (pelo menos um; vários em `task_projects`, ADR-045) — no banco (`NOT NULL` no principal), no Zod e no service. Vale para UI e MCP.
- **Cadastros nunca são excluídos**, só arquivados (`archivedAt`) (ADR-018). Tarefas podem ser excluídas pelo admin ou por quem criou (ADR-063); agente nunca exclui.
- **Zod no servidor sempre**, schemas em `src/lib/validation/` (ADR-006).
- **`task_events` é só-inserção**; toda escrita grava um evento com o `Actor`. Única exceção: a exclusão definitiva da tarefa leva os eventos dela, com rastro em `task_deletions` (ADR-063).
- **Sem SQL cru** fora de `src/db/` e `src/server/services/`.
- **Migrações só aditivas** (sem `DROP` nem reescrita de dados): não há backup definido (`docs/INFRA.md` §9).
- **Testes de integração só no banco `itc_tasks_test`.**
- Decisão nova com alternativa razoável → **ADR em `docs/DECISIONS.md` antes do código**. Não reabrir ADR sem escrever outro.

## Identidade visual

- Tokens em `src/styles/globals.css` (`@theme`); claro em `:root, [data-theme="light"]`, escuro em `[data-theme="dark"]`. **Nunca hex em componente.**
- Principais: `--bg-base #F5F0E8`, `--bg-surface #FDFBF7`, `--accent #008F95` (escuro `#30A5AB`), `--accent-text #006C72`, `--accent-solid #007A80` (fundo com `on-accent`, ADR-035), `on-err` sobre `err` (ADR-039), `--text-base #1A2020`. Funcionais (`ok`, `warn`, `err`, `info`, `sev-medium`) **só em estado**.
- Texto/ícone em ciano → `accent-text`. `warn` e `sev-medium` nunca como texto no claro.
- Inter em toda a UI (`tabular-nums` em IDs, datas, números); Archivo só no lockup.
- Tema **só claro e escuro**, sem "sistema", salvo em `user.theme` (ADR-013).
- Ícones `lucide-react`, `strokeWidth={1.75}`, 16 px. Status e prioridade: componentes próprios.
- Referências: Design System https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495 · Telas https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9 · `docs/UI.md`.

## Papéis

| Papel | Pode |
|---|---|
| `admin` | Tudo, incluindo membros, workflow, cadastros, automações, tokens de qualquer pessoa |
| `member` | Tarefas, ciclos, marcos, comentários, templates, os próprios tokens e preferências |
| Agente (API key) | Ferramentas MCP permitidas (`tasks:read`, `tasks:write`), em nome do dono do token |

## Componentes obrigatórios do Design System

Button, Field, Select, Controls (checkbox/toggle), StatusBadge/StatusIcon, PriorityBadge/PriorityIcon,
Chip (Projeto/Cliente, UM, GLPI, etiqueta), Avatar, TaskCard, Board/Column, TaskTable, Card, Dialog,
Toast (sonner), Skeleton, EmptyState, Navigation (sidebar expandida 236 px / recolhida 64 px), CommandPalette.
Não criar variantes paralelas desses componentes.

## Decisões críticas

- Better Auth com Argon2id, sem cadastro público, plugins `admin` e `apiKey` (ADR-007, ADR-008).
- MCP embutido em `src/app/mcp/route.ts`, Streamable HTTP, 60 req/min por token (ADR-009).
- pg-boss no processo `worker` para automações, notificações e lembretes; nada pesado na requisição (ADR-010).
- Produção no `glpi-srv` (`/home/glpissh/docker/itc-tasks`), publicado pelo túnel `itcbr-tunnel` do host em `localhost:3021`; sem container de túnel (ADR-028). Uploads ≤ 25 MB, SSE com heartbeat de 25 s (ADR-020, ADR-025).
- "Subtarefas" = `checklist_items`, não tarefas filhas (ADR-019).
- ID visível `TI-<number>`; URLs `/tarefas/<number>` (ADR-021).
- Status em 4 categorias fixas: `backlog`, `todo`, `in_progress`, `done` (ADR-022).
- GLPI só como número + link (`GLPI_BASE_URL`), sem integração (ADR-023).

## Modo de execução

- Seguir os módulos de `PROMPT_CLAUDE_CODE.md` em ordem; um módulo por vez.
- Um commit por tarefa, na branch `develop` (ou `feat/…` → `develop`); `main` só por PR `develop → main` com CI verde, nunca push direto (ADR-029, ADR-034). Ao fim do módulo, atualizar `docs/` e **parar para aprovação**.
- **Módulo aprovado → abrir o PR `develop → main`.** "Aprovado" é a mensagem do Cowork em `.conversa/para-claude-code.md` com a frase "Módulo NN aprovado" (sem ajuste pendente), ou o Matheus dizer isso na sessão. Com "Módulo NN aprovado com ajustes", faça os ajustes, envie e responda ao Cowork; o PR só sai com o "aprovado" final.
  1. Envie a `develop` ao GitHub e espere o CI verde (Quality Check e Security).
  2. `gh pr create --base main --head develop --title "Módulo NN — Nome"`, com o corpo: resumo, ADRs novos, link para `docs/modules/NN-nome.md`, resultado do CI e o que ficou de fora.
  3. Se já houver PR aberto de `develop → main`, não abra outro: atualize título e corpo do existente (`gh pr edit`).
  4. Nunca faça o merge. O Matheus faz, com "Create a merge commit" (sem squash, para `develop` e `main` não divergirem).
  5. Escreva em `.conversa/para-cowork.md` o número e o link do PR.
  6. Sem `gh` instalado ou autenticado (`gh auth status`): pare e peça ao Matheus (`winget install GitHub.cli` e `gh auth login`). Nunca token em arquivo.
  7. Depois que o `deploy.yml` existir (Módulo 12), avise no corpo do PR que o merge publica em produção.
- Na dúvida sobre produto, perguntar — não decidir em silêncio.
- Nunca `git add -A`; adicionar arquivo por arquivo e conferir `git status --short`.

### Conversa com o Cowork (`.conversa/`, fora do Git — ADR-030)

O Claude no Cowork revisa cada módulo entre as paradas e lê esta mesma pasta.

- No início da sessão, leia `.conversa/para-claude-code.md` e trate as mensagens ABERTAS.
- Escreva só em `.conversa/para-cowork.md`. Nunca edite `para-claude-code.md`.
- Para responder, crie uma mensagem que cite o número ("Resposta a M-003") e diga o que foi feito.
- Os números são uma sequência única nos dois arquivos: antes de escrever, veja o maior `M-NNN` em `para-claude-code.md` e `para-cowork.md` e use o seguinte.
- Ao fim de cada módulo, escreva "Módulo NN pronto para revisão" em `para-cowork.md`.
- Decisão tomada na conversa vai para um ADR ou para o PROGRESS antes do commit.
- Nunca escreva segredos (senhas, tokens, chaves) nesses arquivos.

## Commits

`type(scope): descrição` — tipos: `feat`, `fix`, `security`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`.
Ex.: `feat(mcp): add create_task tool` · `docs: document module 07 mcp`.

## Ferramentas

- Skill `project-docs` para toda documentação (`docs/modules/NN-*.md`, ADRs, PROGRESS).
- Skill `itc-identidade-visual` para material da marca ITC.
- Repositório `github.com/itc-brasil/itc-tasks`; sem registry de imagens — build no servidor da ITC (ADR-027); CI em GitHub Actions com ações fixadas por SHA.
- Produção em `https://tasks.itcbr.xyz` (MCP em `https://tasks.itcbr.xyz/mcp`). GLPI: `http://glpi.grupoitcbrasil.com.br:8888`. E-mail: Titan Mail, `tasks@itcbr.xyz` (ADR-026).

## Comandos (planejados — confirmar no Módulo 00)

```bash
git config core.hooksPath .githooks             # obrigatório após clonar: bloqueia push na main (ADR-034)
docker compose -f docker-compose.dev.yml up -d   # Postgres 18.6 + Mailpit
npm run dev              # app em http://localhost:3000
npm run worker:dev       # pg-boss
npm run db:generate      # drizzle-kit generate
npm run db:migrate       # aplica migrações
npm run db:seed          # status, etiquetas, automações, admin
npm run lint && npm run typecheck
npm test             # Vitest
npm run test:e2e         # Playwright + axe
```

## Onde está cada coisa

`docs/PRD.md` (produto) · `docs/ARCHITECTURE.md` (arquitetura) · `docs/DECISIONS.md` (ADRs) ·
`docs/SCHEMA.md` (banco) · `docs/API.md` (MCP e rotas) · `docs/FLOWS.md` (fluxos) ·
`docs/UI.md` (interface) · `docs/INFRA.md` (servidor, túnel, deploy) · `docs/PROGRESS.md` (estado atual) · `docs/modules/` (por módulo).
