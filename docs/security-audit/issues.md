# Issues da auditoria de segurança — ITC Tasks (19/10/2026)

Gerado por `gerar_relatorio.py`. Copie cada bloco para uma issue no GitHub; nenhuma foi criada automaticamente.

## Status das correções

| Issue | GitHub | Commit | Situação | Como foi testado |
|---|---|---|---|---|
| 1 | #18 | `b3b90a1` | corrigida (ADR-058) | tests/integration/auth-surface.test.ts: /api-key/update e /api-key/delete dão 404, token revogado segue 401; login, sessão e logout continuam |
| 2 | #19 | `24b4cde` | corrigida (ADR-059) | curl -I no build de produção mostra os 7 cabeçalhos; E2E completo (43) contra next start; varredura de 9 telas sem violação de CSP; service worker ativo |
| 3 | #20 | `36ace6d` | corrigida (ADR-061; A08 pelo COOP do commit 24b4cde) | src/lib/validation/tasks.test.ts (href só, sem class, limites) e tests/integration/comments.test.ts (label da menção vem do banco) |
| 4 | #21 | `dae182f` | não será corrigida (risco aceito, M-112) | issue fechada como not planned; risco registrado no INFRA §11 e no PROGRESS |
| 5 | #22 | `4ec4202` | procedimento corrigido; conferência do auth.log e troca de senha com o Matheus | pipeline sh/read/export conferido em node:24.22.0-alpine com valores falsos |
| 6 | #23 | `9508ebb` | corrigida (ADR-060) | tests/integration/notifications.test.ts: IP interno, host parecido e porta recusados; 409 sem troca de dono; 10 por pessoa; 6º teste por minuto = null (429) |
| 7 | #24 | `9b08c48` | corrigida | tests/integration/origin.test.ts: 403 de subdomínio irmão e sem Origin; 415 com text/plain; mesma origem segue para a sessão |
| 8 | #25 | `101dd6a` | corrigida | tests/integration/mcp.test.ts: lote JSON-RPC = 400; 11º token ativo recusado, volta a criar depois de revogar um |
| 9 | #26 | `4ea3c0d` | corrigida; exigência de SHA nas Actions (configuração do repositório) com o Matheus | src/lib/env-checks.test.ts; docker compose config falha sem POSTGRES_PASSWORD; portas do dev em 127.0.0.1; docker build --check |
| 10 | #27 | `ac6b644` | corrigida; A15 pelo ADR-058; lookahead do proxy e version do /api/health mantidos (sem impacto) | tests/integration/sse-session.test.ts: desativar o membro faz o ping encerrar o stream |

--- ISSUE 1 ---
## [Segurança] Token de agente revogado pode ser reativado pelo dono via endpoint nativo do apiKey

**Labels sugeridas:** `security`, `severidade:média`
**Achados:** A01

### Descrição
Revogar um token (ADR-049) grava `enabled: false`. O plugin `@better-auth/api-key`, exposto inteiro em `/api/auth/[...all]`, oferece `POST /api/auth/api-key/update`, que aceita `enabled` vindo do cliente e só confere se o token é da pessoa. O dono reativa um token que o admin revogou. `POST /api/auth/api-key/delete` também apaga fisicamente, contra "revogar = desativar".

### Evidência
`src/server/services/agents.ts:114-117`
```ts
await db
  .update(apikey)
  .set({ enabled: false, updatedAt: new Date() })
  .where(eq(apikey.id, keyId));
```
`node_modules/@better-auth/api-key/dist/index.mjs:1501`
```js
if (enabled !== void 0) newValues.enabled = enabled;
```
`src/server/auth.ts:64-67` registra `apiKey({ defaultPrefix: "itct_", rateLimit: … })` sem `disabledPaths`.

### Impacto
Um token vazado ou mal usado, revogado pelo admin, volta a ler e escrever tarefas pelo `/mcp` com os mesmos escopos, sem rastro de quem reativou.

### Sugestão de correção
Desabilitar no Better Auth os caminhos `/api-key/update`, `/api-key/delete` e `/api-key/create` (a UI já usa os services), ou registrar a revogação em coluna/tabela que o plugin não altere e conferi-la em `agentFromKey`.

### Critérios de aceite
- [ ] `POST /api/auth/api-key/update` com `enabled: true` num token revogado não o reativa (teste de integração)
- [ ] `POST /api/auth/api-key/delete` não apaga linha de `apikey`
- [ ] Token revogado continua recebendo 401 no `/mcp`
- [ ] ADR registrando a escolha (disabledPaths × coluna própria)
--- FIM ISSUE 1 ---

--- ISSUE 2 ---
## [Segurança] Cabeçalhos de segurança ausentes (CSP, frame-ancestors, HSTS) apesar da documentação

**Labels sugeridas:** `security`, `severidade:média`
**Achados:** A02

### Descrição
`next.config.ts` não tem `headers()` e `src/proxy.ts` não define cabeçalhos. A `docs/ARCHITECTURE.md:117` afirma que CSP, `frame-ancestors 'none'`, `nosniff` e `Referrer-Policy` estão em `next.config.ts`.

### Evidência
`next.config.ts:3-9`
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
};
```

### Impacto
Sem segunda camada se surgir um XSS; páginas (inclusive `/login`) podem ser emolduradas para clickjacking; sem COOP, `window.opener` fica disponível (ver Issue 3).

### Sugestão de correção
Adicionar `headers()` com CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, ajustando `style-src`/`script-src` ao Next), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin` e `Strict-Transport-Security`. Validar com o E2E e o service worker.

### Critérios de aceite
- [ ] `curl -I https://tasks.itcbr.xyz/login` mostra CSP com `frame-ancestors 'none'`, nosniff, Referrer-Policy, COOP e HSTS
- [ ] E2E e axe passam com a CSP ativa, sem erros de CSP no console
- [ ] `docs/ARCHITECTURE.md` descreve o que de fato está configurado
--- FIM ISSUE 2 ---

--- ISSUE 3 ---
## [Segurança] Tiptap: reverse tabnabbing no editor e atributos do JSON sem filtro

**Labels sugeridas:** `security`, `severidade:baixa`
**Achados:** A08, A09

### Descrição
O editor de descrição usa `StarterKit` com o Link padrão (`openOnClick: true`); o Tiptap abre o link com `window.open(href, target)` sem `noopener`. Além disso, o schema aceita o JSON com `.loose()`: chamando a Server Action direto, um membro grava marca `link` com `class`/`target`/`rel` arbitrários e menção com `label` que não bate com a pessoa do `id`.

### Evidência
`src/components/tasks/description-editor.tsx:24`
```ts
extensions: [StarterKit],
```
`src/lib/validation/tasks.ts:33`
```ts
const descriptionJson = z.object({ type: z.literal("doc") }).loose();
```

### Impacto
Página externa aberta pelo link troca a aba do ITC Tasks por um falso login; overlay de tela inteira com classes Tailwind levando a site externo; menção com nome falso.

### Sugestão de correção
`StarterKit.configure({ link: { openOnClick: false } })` no editor editável (ou COOP, Issue 2). No service, normalizar o documento: manter só `href` na marca `link`, regravar o `label` da menção a partir do banco e limitar tamanho e profundidade.

### Critérios de aceite
- [ ] Clicar num link no editor de descrição não abre aba com `window.opener`
- [ ] Server Action com marca `link` contendo `class` grava o documento sem `class`
- [ ] Menção com `label` falso é regravada com o nome real
- [ ] Documento acima do limite é recusado com erro de validação
--- FIM ISSUE 3 ---

--- ISSUE 4 ---
## [Segurança] main sem proteção no servidor; merge publica em produção com acesso ao grupo docker

**Labels sugeridas:** `security`, `severidade:média`
**Achados:** A03

### Descrição
No plano Free, `branches/main/protection` e `rulesets` respondem 403 e não há `environment` no `deploy.yml`. O único bloqueio de push na `main` é o hook local `.githooks/pre-push`, contornável. O deploy roda como `github-deploy`, membro do grupo `docker` no `glpi-srv`.

### Evidência
`.github/workflows/deploy.yml:3-6`
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```
`deploy.yml:15-19`: job `deploy` sem `environment:`.

### Impacto
Conta comprometida de qualquer um dos 3 admins publica código arbitrário no host que também roda GLPI e RustDesk (grupo docker ≈ root).

### Sugestão de correção
2FA obrigatório na organização; reduzir admins a quem precisa; avaliar GitHub Team para branch protection na `main` e environment `production` com revisor restrito à `main`. A chave SSH com `command=` forçado já limita o roubo da chave.

### Critérios de aceite
- [ ] 2FA obrigatório ligado na organização
- [ ] Lista de admins revisada e registrada no INFRA
- [ ] Decisão sobre GitHub Team registrada em ADR (e, se adotado, push direto na `main` recusado pelo GitHub)
--- FIM ISSUE 4 ---

--- ISSUE 5 ---
## [Segurança] Senha do admin do seed vai para o argv do sudo (auth.log)

**Labels sugeridas:** `security`, `severidade:média`
**Achados:** A04

### Descrição
O passo 5 do procedimento de implantação expande `SEED_ADMIN_PASSWORD` na linha de comando de `sudo -u github-deploy env …`. O sudo registra o `COMMAND=` completo e a senha aparece em `ps` e `/proc/*/cmdline`.

### Evidência
`docs/INFRA.md:384`
```sh
sudo -u github-deploy env SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" … docker compose exec -T -e SEED_ADMIN_PASSWORD …
```

### Impacto
A senha do primeiro admin pode estar em texto claro nos logs do `glpi-srv`, legível por root e pelo grupo `adm`.

### Sugestão de correção
Conferir `sudo grep -c SEED_ADMIN_PASSWORD /var/log/auth.log*` e `journalctl _COMM=sudo | grep -c SEED_ADMIN`; se houver ocorrência, trocar a senha do admin pela tela. Reescrever o passo com `sudo --preserve-env=SEED_ADMIN_EMAIL,SEED_ADMIN_PASSWORD,SEED_ADMIN_NAME -u github-deploy …`.

### Critérios de aceite
- [ ] Verificação dos logs feita e resultado registrado (sem o valor)
- [ ] Senha do admin trocada, se encontrada nos logs
- [ ] `docs/INFRA.md` sem senha expandida em argumento de comando
--- FIM ISSUE 5 ---

--- ISSUE 6 ---
## [Segurança] Web Push aceita endpoint arbitrário (SSRF cego com amplificação)

**Labels sugeridas:** `security`, `severidade:baixa`
**Achados:** A05, A16

### Descrição
O schema aceita qualquer URL `https://` como endpoint; `/api/push/test` faz POST a todas as assinaturas da pessoa, sem limite, e devolve quantas responderam 2xx. Não há limite de assinaturas por pessoa. O upsert por `endpoint` também reatribui o `userId` (sem impacto prático: o endpoint é secreto).

### Evidência
`src/lib/validation/notifications.ts:18`
```ts
endpoint: z.url().startsWith("https://").max(2000),
```
`src/app/api/push/test/route.ts:8-9`
```ts
const sent = await sendTestPush(actor);
return Response.json({ sent }, { status: 202 });
```

### Impacto
Um membro usa o `glpi-srv` para sondar serviços HTTPS internos (127.0.0.1, 10.10.10.x) com oráculo de resposta, e multiplica requisições de saída.

### Sugestão de correção
Aceitar só hosts de push service conhecidos (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`); limitar assinaturas por pessoa; limite de taxa no `/api/push/test`; no conflito de `endpoint` de outra pessoa, não reatribuir.

### Critérios de aceite
- [ ] Endpoint `https://127.0.0.1/...` é recusado com 400
- [ ] Acima do limite de assinaturas por pessoa a inscrição é recusada
- [ ] `/api/push/test` responde 429 acima do limite
- [ ] Endpoint já de outra pessoa não muda de dono
--- FIM ISSUE 6 ---

--- ISSUE 7 ---
## [Segurança] Rotas POST com cookie sem checagem de Origin (CSRF entre subdomínios)

**Labels sugeridas:** `security`, `severidade:baixa`
**Achados:** A06

### Descrição
`/api/push/subscribe` lê `request.json()` sem conferir `Origin`, `Sec-Fetch-Site` nem `Content-Type`; `/api/attachments` (multipart) também não confere `Origin`. O cookie usa `SameSite=Lax`, que não barra requisições same-site de subdomínios irmãos em `itcbr.xyz`.

### Evidência
`src/app/api/push/subscribe/route.ts:10`
```ts
const row = await subscribePush(actor, await request.json());
```

### Impacto
Uma página comprometida em `monitor.`, `dash.` ou `notescan.itcbr.xyz` registra o endpoint do atacante na conta da vítima e passa a receber os pushes dela (TI-N e trechos de comentário).

### Sugestão de correção
Helper único que recusa `Origin` diferente de `BETTER_AUTH_URL` (e exige `application/json` onde couber), aplicado em todos os `POST`/`DELETE` de `src/app/api/**` fora do Better Auth.

### Critérios de aceite
- [ ] POST de outra origem recebe 403 em `/api/push/subscribe` e `/api/attachments`
- [ ] POST `text/plain` em `/api/push/subscribe` recebe 415 ou 400
- [ ] Teste de integração cobre as duas rotas
--- FIM ISSUE 7 ---

--- ISSUE 8 ---
## [Segurança] Limite de 60 req/min do /mcp contornável com lote JSON-RPC

**Labels sugeridas:** `security`, `severidade:baixa`
**Achados:** A07

### Descrição
O limite conta uma vez por requisição HTTP (`agentFromKey`), mas o SDK aceita array JSON-RPC de até 100 mensagens. Não há limite de tokens por pessoa.

### Evidência
`src/app/mcp/route.ts:13`
```ts
const agent = await agentFromKey(key);
```
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/requestBody.js:4`
```js
export const MAX_BATCH_SIZE = 100;
```

### Impacto
Até 6.000 chamadas de ferramenta por minuto por token, contra os 60 do ADR-009; carga no banco e escrita em massa por agente descontrolado.

### Sugestão de correção
Recusar corpo em array no `route.ts` antes do `handleRequest` (400) e limitar tokens ativos por pessoa.

### Critérios de aceite
- [ ] POST com array JSON-RPC no `/mcp` recebe 400
- [ ] Criar token acima do limite por pessoa é recusado
- [ ] Teste de integração da 61ª chamada continua recebendo 429
--- FIM ISSUE 8 ---

--- ISSUE 9 ---
## [Segurança] Endurecer validação de ambiente, compose e CI

**Labels sugeridas:** `security`, `severidade:baixa`
**Achados:** A10, A11, A12, A13, A17, A18

### Descrição
Itens de configuração de baixo risco, agrupados: validação de env permissiva, `POSTGRES_PASSWORD` sem `:?`, portas do dev em todas as interfaces, `GITHUB_TOKEN` persistido no checkout, exigência de SHA desligada no repositório, imagens por tag e a pasta `Claude outputs/` fora do `.gitignore`.

### Evidência
`src/lib/env.ts:9`
```ts
BETTER_AUTH_SECRET: z.string().min(32),
```
`docker-compose.yml:42`
```yaml
- POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```
`docker-compose.dev.yml:8,17`
```yaml
ports: ["5435:5432"]
ports: ["8025:8025", "1025:1025"]
```
`.github/workflows/ci.yml:39,82,125`: `actions/checkout@3d3c…90b1` sem `persist-credentials: false`.

### Impacto
Segredo de CI aceito em produção, erro de configuração silencioso, banco de dev exposto na rede local e token do CI ao alcance de scripts de instalação.

### Sugestão de correção
Em produção, recusar segredos com prefixo `ci-`/`changeme`/`test`, exigir `https://` em `BETTER_AUTH_URL` e `SMTP_USER`/`SMTP_PASSWORD` em par; `${POSTGRES_PASSWORD:?defina no .env}`; `127.0.0.1:` nas portas do dev; `persist-credentials: false`; ligar `sha_pinning_required`; fixar imagens por digest; `Claude outputs/` no `.gitignore` e no `.dockerignore`.

### Critérios de aceite
- [ ] Teste do `env.ts` recusa o segredo do CI com `NODE_ENV=production`
- [ ] `docker compose config` falha sem `POSTGRES_PASSWORD`
- [ ] `docker compose -f docker-compose.dev.yml ps` mostra portas só em 127.0.0.1
- [ ] Os três checkouts do CI com `persist-credentials: false`
- [ ] `git check-ignore "Claude outputs/x"` confirma a exclusão
--- FIM ISSUE 9 ---

--- ISSUE 10 ---
## [Segurança] Endpoints nativos do Better Auth contornam os services; SSE de membro desativado

**Labels sugeridas:** `security`, `severidade:informativa`
**Achados:** A14, A15, A21

### Descrição
Os endpoints `/api/auth/update-user` e `/api/auth/admin/*` (remove-user, set-role, impersonate-user, set-user-password) gravam sem passar pelos services e sem evento. O SSE confere a sessão só ao conectar. Itens menores: lookahead do `proxy.ts` sem delimitador e `version` no `/api/health`.

### Evidência
`src/server/auth.ts:58-62` registra `admin({ defaultRole: "member", adminRoles: ["admin"] })` sem `disabledPaths`.
`src/app/api/events/route.ts:8-9`
```ts
const actor = await sessionActor();
if (!actor) return new Response(null, { status: 401 });
```

### Impacto
Regras de negócio (ADR-018, `assertNotSelf`, limite de nome) e auditoria contornáveis por admin ou pela própria pessoa; membro desativado segue vendo metadados em tempo real.

### Sugestão de correção
`disabledPaths` para `/update-user`, `/admin/remove-user`, `/admin/set-role`, `/admin/impersonate-user` e `/admin/set-user-password` (a UI já usa os services); reconferir a sessão a cada ping do SSE; delimitar o lookahead do proxy.

### Critérios de aceite
- [ ] Os caminhos listados respondem 404 pelo `/api/auth`
- [ ] Membro desativado tem o SSE encerrado em até 30 s
- [ ] Telas de membros e conta continuam funcionando (E2E)
--- FIM ISSUE 10 ---
