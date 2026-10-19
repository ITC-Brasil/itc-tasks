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

- As correções: as 10 issues do `issues.md`, a serem abertas pelo Matheus.
- Ainda não verificado: se o Cloudflare injeta cabeçalhos de segurança, e se a senha do seed
  está mesmo no `auth.log` do `glpi-srv` (comando na Issue 5).

## Commits

```
33cb36e chore(security): ignore audit venv and renders
c1ad985 docs(security): add module 13 audit report, issues and generator
```
