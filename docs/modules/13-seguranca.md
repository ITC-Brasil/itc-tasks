# Módulo 13 — Auditoria de segurança

Módulo adicional, fora do `PROMPT_CLAUDE_CODE.md`, pedido pelo Matheus em 19/10/2026. **Só
auditoria e relatório:** nenhuma falha foi corrigida. Cada correção vira uma issue (texto em
`docs/security-audit/issues.md`) e será feita depois, com ADR quando houver alternativa
razoável. Branch `feat/13-seguranca`, a partir da `develop` em `1bf8e4a`.

## O que foi produzido

- `docs/security-audit/relatorio-auditoria-seguranca.pdf`: 14 páginas A4, em pt-BR. Tem capa com
  escopo e nota metodológica, resumo executivo com gráfico de rosca e de barras, pontos fortes e
  fracos, tabela de achados por categoria, recomendações P1 a P3 e a seção "ISSUES PARA O GITHUB".
- `docs/security-audit/issues.md`: as 10 issues em Markdown, entre `--- ISSUE n ---` e
  `--- FIM ISSUE n ---`. Nenhuma foi criada no GitHub (`gh issue create` não foi rodado).
- `docs/security-audit/gerar_relatorio.py`: fonte única dos achados (listas `FINDINGS`,
  `STRENGTHS` e `ISSUES`). Gera o PDF e o `issues.md`. Com `--render`, rasteriza as páginas em
  `docs/security-audit/_render/`.
- `.gitignore`: `docs/security-audit/.venv/` e `docs/security-audit/_render/`.

Para regerar:

```bash
python -m venv docs/security-audit/.venv
docs/security-audit/.venv/Scripts/pip install reportlab matplotlib pymupdf
docs/security-audit/.venv/Scripts/python docs/security-audit/gerar_relatorio.py --render
```

As fontes vêm do `matplotlib` (DejaVu Sans e Sans Mono), então o script não depende das fontes do
Windows.

## Como as categorias foram mapeadas

O ITC Tasks é single-team. **Não há multi-tenant**, e a categoria 1 não foi forçada a ter achados
de inquilino.

| Categoria | Mapeamento |
|---|---|
| 1. Banco sem tranca | (a) admin × member nos services; (b) recursos pessoais (API keys, preferências, notificações, push, sessões, filtros) só para o dono ou o admin; (c) agente MCP limitado a `tasks:read`/`tasks:write`, em nome do dono do token |
| 2. Permissão no navegador | Cada gate de UI cruzado com a Server Action, o `route.ts` e o service (ADR-003) |
| 3. IDOR | Todas as Server Actions (9 arquivos), os 8 `route.ts` e as ferramentas MCP. Tarefas, ciclos, marcos, templates e anexos são da equipe por design (ADR-052, ADR-053) |
| 4. Chaves expostas | Código, configs, compose, Dockerfile, CI (`ci`, `security`, `deploy`), scripts, seed, `docs/` e `git log -p --all` (~109 mil linhas). Valores sempre mascarados |
| 5. XSS | Render do Tiptap, protocolos de link, importação do Windshift, anexos, e-mail, web-push, `GLPI_BASE_URL` e cabeçalhos HTTP |

A varredura foi feita por três agentes em paralelo (1–3, 4 e 5). Antes de entrar no relatório,
cada achado médio foi conferido de novo no código. Exemplo: `node_modules/@better-auth/api-key/dist/index.mjs:1501`
grava `enabled` vindo do cliente, e `enabled` não está na lista de propriedades restritas de `:1485`.

## Resultado

**21 achados:** 0 crítico, 0 alto, 4 médios, 9 baixos e 8 informativos. Há também **21 pontos
fortes** com evidência. **Nenhum segredo real** apareceu no repositório nem no histórico.

| ID | Sev. | Local | Resumo |
|---|---|---|---|
| A01 | média | `src/server/services/agents.ts:105-118` · `src/server/auth.ts:64-67` | Token revogado (`enabled:false`) é reativado pelo dono em `POST /api/auth/api-key/update` |
| A02 | média | `next.config.ts:3-9` · `docs/ARCHITECTURE.md:117` | Sem CSP, frame-ancestors, HSTS e COOP; a doc diz que existem |
| A03 | média | `.github/workflows/deploy.yml:3-6,15-19` | `main` sem proteção no GitHub (plano Free); o deploy cai no grupo `docker` |
| A04 | média | `docs/INFRA.md:384` | Senha do seed no argv do `sudo` (auth.log/journal) |
| A05 | baixa | `src/lib/validation/notifications.ts:18` | Endpoint de push aceita qualquer `https://`: SSRF cego |
| A06 | baixa | `src/app/api/push/subscribe/route.ts:10` | POST com cookie sem checagem de Origin (CSRF entre subdomínios) |
| A07 | baixa | `src/app/mcp/route.ts:13` | Lote JSON-RPC (100) passa por cima do limite de 60 req/min |
| A08 | baixa | `src/components/tasks/description-editor.tsx:24` | Reverse tabnabbing (`window.open` sem `noopener`) |
| A09 | baixa | `src/lib/validation/tasks.ts:33` | JSON do Tiptap `.loose()`, sem filtro de atributos nem de tamanho |
| A10–A13 | baixa | `src/lib/env.ts:9` · `docker-compose.yml:42` · `docker-compose.dev.yml:8,17` · `.github/workflows/ci.yml:39,82,125` | Endurecimento de env, compose e CI |
| A14–A21 | info | ver PDF | SSE após o ban, endpoints nativos do Better Auth, upsert do push, pinagem, `Claude outputs/`, `jwks`, cache do SW, proxy e health |

As issues agrupam os achados. A Issue 9 reúne A10 a A13, A17 e A18. A Issue 10 reúne A14, A15 e
A21. A Issue 6 reúne A05 e A16. A Issue 3 reúne A08 e A09.

## Verificação

| Cenário | Como foi verificado | Resultado |
|---|---|---|
| PDF gerado | `gerar_relatorio.py --render` | ✅ 14 páginas, A4, cabeçalho e rodapé com número |
| Gráficos | leitura dos PNG de `_render/p02.png` | ✅ rosca (4/9/8) e barras por categoria legíveis |
| Tabelas | `_render/p05.png`, `p06.png` | ✅ chips sem quebra depois do ajuste (largura 2,6 cm, fonte 6,2); título de categoria sem órfão (`keepWithNext`) |
| Nenhum segredo no relatório | `grep -rn "itct_[A-Za-z0-9]\{8,\}" docs/security-audit/` | ✅ vazio; os valores aparecem mascarados (`3d3c…90b1` é SHA de action, público) |
| `.env` fora do Git | `git check-ignore -v .env`, `git log --all --name-only` | ✅ `.gitignore:20`, nunca commitado |

## Fora deste módulo

- Ver "Ficaram de fora" na seção de correções.
- Ainda não verificado: se o Cloudflare injeta cabeçalhos de segurança, e se a senha do seed
  está mesmo no `auth.log` do `glpi-srv` (comando na Issue 5).

## Correções (M-112, aprovado com ajustes)

Depois da revisão, o Matheus autorizou abrir as issues e corrigir tudo, menos a Issue 4. As issues
#18 a #27 foram criadas com `gh issue create`, com as labels `security` e `severidade:*`, que foram
criadas na hora.

| Issue | GitHub | Commit | Situação | Como foi testado |
|---|---|---|---|---|
| 1 | #18 | `b3b90a1` | Corrigida. `src/app/api/auth/[...all]/route.ts` passa a aceitar só `/sign-in/email`, `/sign-out` e `/get-session` (ADR-058) | `tests/integration/auth-surface.test.ts` |
| 2 | #19 | `24b4cde` | Corrigida. `headers()` em `next.config.ts` (ADR-059); `ARCHITECTURE.md` alinhada | `curl -I` mostra os 7 cabeçalhos; E2E completo contra `next start`; varredura de 9 telas sem violação de CSP; service worker `activated` |
| 3 | #20 | `36ace6d` | Corrigida. O `transform` em `src/lib/validation/tasks.ts` deixa só o `href` no link, tira `class`/`style` e limita o documento a 200 000 caracteres e 20 níveis; `relabelMentions` em `src/server/services/tasks.ts` (ADR-061). A08 fechado pelo COOP | `src/lib/validation/tasks.test.ts`, `tests/integration/comments.test.ts` |
| 4 | #21 | `dae182f` | **Não será corrigida.** Risco aceito pelo Matheus (plano pago). Issue fechada como *not planned*; registrada em INFRA §11 e no PROGRESS | — |
| 5 | #22 | `4ec4202` | Procedimento corrigido em `docs/INFRA.md:384`: os valores entram pelo stdin do container. A conferência do `auth.log` e a troca de senha ficam com o Matheus | pipeline `sh`/`read`/`export` conferido em `node:24.22.0-alpine` com valores falsos |
| 6 | #23 | `9508ebb` | Corrigida. Hosts de push service, sem porta; a assinatura não troca de dono (409); 10 por pessoa; `/api/push/test` limitado a 5 por minuto (ADR-060) | `tests/integration/notifications.test.ts` |
| 7 | #24 | `9b08c48` | Corrigida. `src/server/origin.ts` (`rejectCrossSite`) nas 4 rotas com cookie | `tests/integration/origin.test.ts` |
| 8 | #25 | `101dd6a` | Corrigida. `/mcp` recusa lote (400) e mantém o teto de 4 MB do SDK; no máximo 10 tokens ativos por pessoa | `tests/integration/mcp.test.ts` |
| 9 | #26 | `4ea3c0d` | Corrigida. `src/lib/env-checks.ts`; `:?` no compose; imagens fixadas por digest; dev só em `127.0.0.1`; `persist-credentials: false`; `Claude outputs/` ignorada | `src/lib/env-checks.test.ts`; `docker compose config`; `docker build --check` |
| 10 | #27 | `ac6b644` | Corrigida. O SSE confere `stillSignedIn` a cada ping. A15 fechado pelo ADR-058 | `tests/integration/sse-session.test.ts` |

**Ficaram de fora, com o motivo:**
- A17, exigência de SHA nas Actions: é configuração do repositório no GitHub e fica com o Matheus.
  As actions já estão fixadas por SHA.
- A19, chave `jwks`: decisão M-104 mantida.
- A20, cache do service worker depois de a sessão expirar: precisa de mudança no `sw.js` e no
  fluxo de sessão; não é pequena.
- A21: o lookahead do `proxy.ts` não muda, porque mexer no `matcher` traz risco sem ganho (as
  páginas revalidam a sessão). O `version` do `/api/health` também fica: é documentado (API.md
  §6) e serve para conferir o deploy.

**Antes do merge na `main` (pede ação do Matheus):**
- O `src/lib/env.ts` passa a recusar, em produção pública, um `BETTER_AUTH_URL` sem https, um
  segredo com cara de exemplo ou de CI (prefixo `ci-`, `test`, `changeme`… ou menos de 10
  caracteres distintos) e `SMTP_USER` sem `SMTP_PASSWORD`. O `.env` do `glpi-srv` foi gerado com
  `openssl rand` e deve passar. Se não passar, o app não sobe. Conferir sem expor valores:
  `sudo -u github-deploy grep -c '^BETTER_AUTH_URL=https://' ~glpissh/docker/itc-tasks/.env`.
- O `docker-compose.yml` exige `POSTGRES_PASSWORD` no `.env`. Já é o caso em produção.

**Durante a verificação**, o banco `itc_tasks_test` tinha 1 117 jobs `automation.evaluate`
acumulados das execuções do dia, e o `beforeAll` de `automations.test.ts` estourava os 10 s. Esses
jobs foram apagados. Era só o banco de teste, sem relação com as correções; no CI o banco é novo.

## Commits

```
33cb36e chore(security): ignore audit venv and renders
c1ad985 docs(security): add module 13 audit report, issues and generator
05b15ec docs: document module 13 security audit
dae182f docs(infra): record accepted risk of unprotected main
0b33ef7 docs: add ADR-058 to ADR-061 for security fixes
b3b90a1 security(auth): allowlist Better Auth HTTP endpoints
24b4cde security(headers): add CSP, COOP, HSTS and frame protection
4ec4202 security(infra): pass seed credentials via stdin, not sudo argv
36ace6d security(tiptap): normalize rich-text JSON and relabel mentions
9508ebb security(push): restrict endpoints to push services and cap usage
9b08c48 security(api): reject cross-origin POST/DELETE on cookie routes
101dd6a security(mcp): reject JSON-RPC batches and cap active tokens
4ea3c0d security(config): harden env validation, compose and CI
ac6b644 security(sse): close event stream when the member loses access
3a6c77f chore(lint): ignore the security audit venv
```
