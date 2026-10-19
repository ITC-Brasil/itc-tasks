"""Gera o relatório da auditoria de segurança (Módulo 13) e o issues.md.

Fonte única: as listas FINDINGS, STRENGTHS e ISSUES abaixo. Para regerar:
    python -m venv docs/security-audit/.venv
    docs/security-audit/.venv/Scripts/pip install reportlab matplotlib pymupdf
    docs/security-audit/.venv/Scripts/python docs/security-audit/gerar_relatorio.py
Com --render, rasteriza as páginas em docs/security-audit/_render/ (fora do Git).
"""

import os
import sys
import tempfile
from collections import Counter
from xml.sax.saxutils import escape

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle  # noqa: E402
from reportlab.lib.units import cm  # noqa: E402
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")
ISSUES_MD = os.path.join(HERE, "issues.md")
TITLE = "Relatório de Auditoria de Segurança — ITC Tasks"
DATE = "19/10/2026"
COMMIT = "1bf8e4a (develop)"

SEV = {  # nome: (cor, ordem)
    "crítica": ("#B91C1C", 0),
    "alta": ("#EA580C", 1),
    "média": ("#D97706", 2),
    "baixa": ("#2563EB", 3),
    "informativa": ("#6B7280", 4),
}
STRONG = "#059669"
CATS = {
    1: "1. Banco sem tranca (isolamento)",
    2: "2. Permissão no navegador",
    3: "3. IDOR",
    4: "4. Chaves expostas e configuração",
    5: "5. Inputs sem tratamento (XSS)",
}

# ── Achados verificados ───────────────────────────────────────────────
# (id, severidade, categoria, local, descrição, condição)
FINDINGS = [
    ("A01", "média", 1, "src/server/services/agents.ts:105-118 · src/server/auth.ts:64-67 · node_modules/@better-auth/api-key/dist/index.mjs:1354,1485,1494,1501",
     "Revogar token = enabled:false, mas o endpoint nativo POST /api/auth/api-key/update (exposto por api/auth/[...all]) deixa o dono gravar enabled:true. Token revogado pelo admin volta a valer no /mcp com os mesmos escopos. /api-key/delete ainda apaga fisicamente (contra ADR-049).",
     "Membro ativo, dono do token; keyId visível em /api/auth/api-key/list."),
    ("A02", "média", 5, "next.config.ts:3-9 · src/proxy.ts:5-7 · docs/ARCHITECTURE.md:117",
     "Nenhum cabeçalho de segurança (CSP, frame-ancestors/X-Frame-Options, nosniff global, Referrer-Policy, COOP, HSTS). A ARCHITECTURE.md afirma que existem em next.config.ts. Sem segunda camada contra XSS; /login e páginas podem ser emolduradas (clickjacking).",
     "Sempre (salvo se o Cloudflare injetar cabeçalhos — não verificado)."),
    ("A03", "média", 4, ".github/workflows/deploy.yml:3-6,15-19 · .githooks/pre-push",
     "A main não tem branch protection no servidor (plano Free: API responde 403) nem environment com revisor; o bloqueio é só o hook local. Qualquer push na main publica em produção como github-deploy, que está no grupo docker do glpi-srv (equivale a root no host que também roda GLPI e RustDesk).",
     "Conta GitHub ou PAT de um dos 3 admins comprometida."),
    ("A04", "média", 4, "docs/INFRA.md:384",
     "O procedimento do seed passa SEED_ADMIN_PASSWORD expandida como argumento de sudo/env. O sudo grava o COMMAND= no auth.log/journal e a senha aparece em ps e /proc/*/cmdline durante a execução.",
     "Quem lê auth.log/journal no glpi-srv (root, grupo adm)."),
    ("A05", "baixa", 5, "src/lib/validation/notifications.ts:18 · src/server/services/notifications.ts:172-201,240-251 · src/app/api/push/test/route.ts:5-10",
     "O endpoint de Web Push aceita qualquer URL https (127.0.0.1, rede 10.10.10.x). /api/push/test dispara POST a todas as assinaturas, sem limite, e devolve {sent}: SSRF cego com oráculo de status 2xx e amplificação por número de assinaturas.",
     "Sessão de membro."),
    ("A06", "baixa", 2, "src/app/api/push/subscribe/route.ts:10 · src/app/api/attachments/route.ts:9-20 · src/server/auth.ts (sem defaultCookieAttributes)",
     "Rotas POST com cookie não conferem Origin nem Content-Type. Com SameSite=Lax, uma página em outro subdomínio de itcbr.xyz (monitor., dash., notescan.) envia POST text/plain sem preflight e registra um endpoint de push do atacante na conta da vítima.",
     "XSS ou comprometimento de um subdomínio irmão; vítima logada."),
    ("A07", "baixa", 1, "src/app/mcp/route.ts:10-19 · node_modules/@modelcontextprotocol/sdk/dist/esm/server/requestBody.js:4 · src/server/services/agents.ts:90-103",
     "O limite de 60 req/min (ADR-009) conta requisições HTTP; o SDK aceita lote JSON-RPC de até 100 mensagens. Um token chega a 6.000 chamadas/min, multiplicado pelos tokens que a pessoa criar (sem limite).",
     "Token válido."),
    ("A08", "baixa", 5, "src/components/tasks/description-editor.tsx:24 · node_modules/@tiptap/extension-link/dist/index.js:145-151",
     "StarterKit 3 traz Link com openOnClick:true; no editor editável o Tiptap abre com window.open(href, target) sem noopener. A página aberta recebe window.opener e pode trocar a aba do app por um falso login (reverse tabnabbing).",
     "Membro coloca link malicioso na descrição; outra pessoa clica."),
    ("A09", "baixa", 5, "src/lib/validation/tasks.ts:33,177 · node_modules/@tiptap/extension-link/dist/index.js:383-394",
     "O JSON do Tiptap é aceito com .loose() sem filtro de atributos nem limite de tamanho/profundidade. Chamando a Server Action direto, um membro grava link com class Tailwind (ex. fixed inset-0 z-50: overlay clicável para site externo) e menção com label falso (\"@Diretoria\" apontando para outra pessoa). href javascript: continua bloqueado.",
     "Membro autenticado; não vale pelo MCP (markdownToDoc só gera texto)."),
    ("A10", "baixa", 4, "src/lib/env.ts:9,23-25 · worker/index.ts:9-18",
     "BETTER_AUTH_SECRET só exige 32 caracteres (o valor do CI passaria em produção); BETTER_AUTH_URL não exige https em produção; SMTP_USER sem SMTP_PASSWORD passa.",
     "Erro de configuração no .env de produção."),
    ("A11", "baixa", 4, "docker-compose.yml:42",
     "POSTGRES_PASSWORD=${POSTGRES_PASSWORD} sem :?. Sem a variável o Compose só avisa; o Postgres recusa senha vazia num banco novo (falha fechado), mas o erro fica implícito.",
     "Variável ausente no .env."),
    ("A12", "baixa", 4, "docker-compose.dev.yml:5-8,17",
     "No dev, Postgres (itc/itc) e Mailpit publicados em todas as interfaces (5435, 8025, 1025).",
     "Notebook de dev em rede compartilhada; dados só de desenvolvimento."),
    ("A13", "baixa", 4, ".github/workflows/ci.yml:39,82,125",
     "actions/checkout sem persist-credentials:false: o GITHUB_TOKEN (contents:read) fica em .git/config enquanto o npm ci roda scripts de terceiros.",
     "Dependência maliciosa no npm ci; escopo só leitura, repositório privado."),
    ("A14", "informativa", 1, "src/app/api/events/route.ts:8-9 · src/server/services/members.ts:99",
     "O SSE confere a sessão só ao conectar; membro desativado mantém o stream (ping 25 s) e segue recebendo metadados task.changed.",
     "Membro desativado com aba aberta."),
    ("A15", "informativa", 2, "src/server/auth.ts:38-48,58-62 · src/app/api/auth/[...all]/route.ts:4",
     "Endpoints nativos do Better Auth passam por fora dos services: /update-user troca o próprio name sem o limite de 80 e sem recalcular iniciais; /admin/remove-user apaga fisicamente (contra ADR-018), /admin/set-role em si mesmo pula assertNotSelf; impersonate e set-user-password sem evento.",
     "Admin (confiável) ou a própria pessoa no update-user."),
    ("A16", "informativa", 3, "src/server/services/notifications.ts:245-248",
     "subscribePush faz upsert por endpoint e reatribui userId: quem souber o endpoint de outra pessoa o toma para si. O endpoint é uma URL aleatória que só o navegador da vítima conhece; não explorável na prática.",
     "Conhecer o endpoint de push da vítima."),
    ("A17", "informativa", 4, "Configuração do repositório · Dockerfile:1,11 · docker-compose*.yml",
     "Actions com allowed_actions:all e sha_pinning_required:false (todas já fixadas por SHA); imagens base por tag, não por digest; Secret Scanning nativo indisponível (Gitleaks cobre).",
     "—"),
    ("A18", "informativa", 4, "Claude outputs/ (não rastreada) · .gitignore · .dockerignore",
     "A pasta Claude outputs/ não está no .gitignore nem no .dockerignore; hoje só tem placeholders, mas há risco de commit ou build acidental.",
     "git add descuidado."),
    ("A19", "informativa", 4, "docs/INFRA.md:404",
     "Fragmento da chave OIDC (jwks) do Authelia exposto numa sessão do Claude Code em 19/10; decisão M-104 foi não rotacionar. Nada no repositório. Reavaliar, porque o histórico das sessões é guardado.",
     "Acesso ao histórico da sessão."),
    ("A20", "informativa", 5, "public/sw.js:44-53",
     "O service worker guarda o HTML autenticado das telas; o cache é limpo no logout, mas não quando a sessão só expira num aparelho compartilhado.",
     "Aparelho compartilhado sem logout."),
    ("A21", "informativa", 2, "src/proxy.ts:11 · src/app/api/health/route.ts:18",
     "O lookahead do proxy não tem delimitador (/apiX e /login-x escapam da checagem otimista — sem impacto, as páginas revalidam a sessão); /api/health é público e expõe version.",
     "—"),
]

# ── Pontos fortes verificados (categoria, evidência) ─────────────────
STRENGTHS = [
    (1, "Não há multi-tenant: é um time único. O isolamento é admin × member, dono do recurso pessoal e escopo do agente — e os três estão aplicados no service."),
    (1, "assertAdmin no service em todas as escritas de cadastro e workflow (catalog.ts:53,63,73,115,126,141,163,173,183,203,218,229,258), membros (members.ts:18,33,65,90,105, com assertNotSelf em :66,91,106) e automações (listRules/saveRule/setRuleEnabled)."),
    (1, "Recursos pessoais filtram pelo dono: saved-filters.ts:18,33,41; notifications.ts:409,439-440,448-456,474,483; preferences.ts:11,15; agents.ts:80,94,113,135."),
    (1, "MCP: o actor é o dono do token, papel e ban relidos a cada requisição (agents.ts:43-52); escopo conferido no handler (mcp.ts:86-87) e ferramenta desabilitada sem escopo (mcp.ts:96); nenhuma ferramenta de admin."),
    (1, "Membro não acessa /api/auth/admin/*: o papel member usa userAc com user:[] e session:[]; o cliente não define permissions nem userId no plugin apiKey."),
    (2, "As 9 Server Actions chamam requireActor() antes de tudo e só repassam o Actor ao service (ADR-003); o Next confere Origin nas Server Actions."),
    (2, "Gates de UI (app-shell.tsx:102, command-palette.tsx:57, config/admin-only.tsx:21) têm a checagem equivalente no service."),
    (2, "requireUser/sessionActor recusam sessão ausente e usuário banido (actor.ts:12,37); papel lido do banco, sem cookie cache; cadastro público desligado (auth.ts:31)."),
    (3, "Rotas por id conferem posse onde há dono: revokeAgentKey (agents.ts:113), editComment só o autor (comments.ts:64), unsubscribe por (userId, endpoint) (notifications.ts:256-257), notificações por actor.userId."),
    (3, "Tarefas, ciclos, marcos, templates, anexos e atividade são da equipe por decisão documentada (ADR-052, ADR-053, 04-tarefas.md:75) — leitura e edição por qualquer membro não é IDOR."),
    (3, "Anexos exigem sessão (attachments/route.ts:10, [id]/route.ts:7) e são lidos por UUID do banco; caminho em disco = UPLOADS_DIR + UUID gerado (attachments.ts:52,65)."),
    (4, "Nenhum segredo real no repositório nem no histórico (git log -p --all, ~109 mil linhas): .env nunca commitado, data/ ignorada, exportação do Windshift fora do Git; Gitleaks em push, PR e semanal sobre todo o histórico."),
    (4, "deploy.yml: permissions:{}, sem action de terceiros, known_hosts por secret com StrictHostKeyChecking=yes, chave 600 apagada com if:always(), chave com restrict,command= forçado no servidor."),
    (4, "Todas as actions fixadas por SHA de 40 caracteres; ci.yml e security.yml com contents:read e sem pull_request_target."),
    (4, "Compose de produção: app só em 127.0.0.1:3021, banco sem porta publicada, segredos só por env_file, nenhum ${VAR:-default}; .env.example com segredos vazios."),
    (4, "Seed: senha só por env, mínimo 12, Argon2id, ON CONFLICT DO NOTHING, log só com o e-mail; nenhuma variável NEXT_PUBLIC_ (env.ts client:{})."),
    (5, "Nenhum HTML de usuário vira HTML: texto rico é jsonb do Tiptap (db/schema/tasks.ts:35,161) desenhado pelo ProseMirror; único dangerouslySetInnerHTML é o chart.tsx do shadcn com config constante; sem eval/innerHTML/new Function."),
    (5, "Link do Tiptap 3.32 bloqueia javascript:/data: no parseHTML, renderHTML, setLink, autolink e colar (isAllowedUri, extension-link/dist/index.js:309-327,403,413-420)."),
    (5, "Importação do Windshift grava cada linha como nó text puro e passa por createTaskSchema (windshift-import.ts:78-83,219-227)."),
    (5, "Anexos: tipo por lista fixa de extensões (SVG e HTML fora), nome limpo, download com Content-Disposition: attachment, nosniff e no-store (attachments.ts:16-50; [id]/route.ts:17-25)."),
    (5, "E-mail com assunto fixo e escapeHtml em nome, texto e URL (notifications.ts:308-309,352-356); push com URL gerada no servidor e resolvida contra a origem (sw.js:81); GLPI só inteiro de até 7 dígitos (validation/tasks.ts:26-30)."),
]

WEAK = [
    "A revogação de token de agente (ADR-049) pode ser desfeita pelo próprio dono pelo endpoint nativo do Better Auth (A01).",
    "Não há cabeçalhos de segurança, e a documentação diz que há (A02).",
    "Produção depende de proteções só do lado do cliente: o hook pre-push e a disciplina dos 3 admins (A03).",
    "O plugin apiKey e o plugin admin expõem endpoints que contornam as regras dos services (A01, A15).",
    "Rotas próprias de push e upload sem checagem de Origin e com URL de saída sem lista de hosts (A05, A06).",
]

RECS = [
    ("P1", "Bloquear /api-key/update, /api-key/delete e /api-key/create no cliente (disabledPaths) ou guardar a revogação fora do campo enabled (Issue 1)."),
    ("P1", "Adicionar headers() no next.config.ts com CSP, frame-ancestors 'none', nosniff, Referrer-Policy, COOP e HSTS, e alinhar a ARCHITECTURE.md (Issue 2)."),
    ("P1", "Exigir 2FA na organização, reduzir admins e avaliar GitHub Team para branch protection e environment production com revisor (Issue 4)."),
    ("P1", "Conferir se a senha do seed está no auth.log/journal; se estiver, trocar a senha do admin; corrigir o procedimento com --preserve-env (Issue 5)."),
    ("P2", "Lista de hosts de push service e limite de assinaturas por pessoa; limite de taxa no /api/push/test (Issue 6)."),
    ("P2", "Checar Origin = BETTER_AUTH_URL e Content-Type nas rotas POST com cookie (Issue 7)."),
    ("P2", "Recusar lote JSON-RPC no /mcp e limitar tokens ativos por pessoa (Issue 8)."),
    ("P2", "Tiptap: openOnClick:false no editor e filtro de atributos/limite de tamanho no servidor (Issue 3)."),
    ("P3", "Endurecer env.ts, compose e CI (Issue 9)."),
    ("P3", "disabledPaths nos endpoints admin/update-user e encerrar SSE de membro desativado (Issue 10)."),
]

# ── Issues para o GitHub ──────────────────────────────────────────────
# (título, severidade, achados, problema, evidência, impacto, correção, aceite)
ISSUES = [
    ("[Segurança] Token de agente revogado pode ser reativado pelo dono via endpoint nativo do apiKey", "média", ["A01"],
     "Revogar um token (ADR-049) grava `enabled: false`. O plugin `@better-auth/api-key`, exposto inteiro em `/api/auth/[...all]`, oferece `POST /api/auth/api-key/update`, que aceita `enabled` vindo do cliente e só confere se o token é da pessoa. O dono reativa um token que o admin revogou. `POST /api/auth/api-key/delete` também apaga fisicamente, contra \"revogar = desativar\".",
     "`src/server/services/agents.ts:114-117`\n```ts\nawait db\n  .update(apikey)\n  .set({ enabled: false, updatedAt: new Date() })\n  .where(eq(apikey.id, keyId));\n```\n`node_modules/@better-auth/api-key/dist/index.mjs:1501`\n```js\nif (enabled !== void 0) newValues.enabled = enabled;\n```\n`src/server/auth.ts:64-67` registra `apiKey({ defaultPrefix: \"itct_\", rateLimit: … })` sem `disabledPaths`.",
     "Um token vazado ou mal usado, revogado pelo admin, volta a ler e escrever tarefas pelo `/mcp` com os mesmos escopos, sem rastro de quem reativou.",
     "Desabilitar no Better Auth os caminhos `/api-key/update`, `/api-key/delete` e `/api-key/create` (a UI já usa os services), ou registrar a revogação em coluna/tabela que o plugin não altere e conferi-la em `agentFromKey`.",
     ["`POST /api/auth/api-key/update` com `enabled: true` num token revogado não o reativa (teste de integração)",
      "`POST /api/auth/api-key/delete` não apaga linha de `apikey`",
      "Token revogado continua recebendo 401 no `/mcp`",
      "ADR registrando a escolha (disabledPaths × coluna própria)"]),
    ("[Segurança] Cabeçalhos de segurança ausentes (CSP, frame-ancestors, HSTS) apesar da documentação", "média", ["A02"],
     "`next.config.ts` não tem `headers()` e `src/proxy.ts` não define cabeçalhos. A `docs/ARCHITECTURE.md:117` afirma que CSP, `frame-ancestors 'none'`, `nosniff` e `Referrer-Policy` estão em `next.config.ts`.",
     "`next.config.ts:3-9`\n```ts\nconst nextConfig: NextConfig = {\n  output: \"standalone\",\n  cacheComponents: true,\n  partialPrefetching: true,\n  devIndicators: false,\n};\n```",
     "Sem segunda camada se surgir um XSS; páginas (inclusive `/login`) podem ser emolduradas para clickjacking; sem COOP, `window.opener` fica disponível (ver Issue 3).",
     "Adicionar `headers()` com CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, ajustando `style-src`/`script-src` ao Next), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin` e `Strict-Transport-Security`. Validar com o E2E e o service worker.",
     ["`curl -I https://tasks.itcbr.xyz/login` mostra CSP com `frame-ancestors 'none'`, nosniff, Referrer-Policy, COOP e HSTS",
      "E2E e axe passam com a CSP ativa, sem erros de CSP no console",
      "`docs/ARCHITECTURE.md` descreve o que de fato está configurado"]),
    ("[Segurança] Tiptap: reverse tabnabbing no editor e atributos do JSON sem filtro", "baixa", ["A08", "A09"],
     "O editor de descrição usa `StarterKit` com o Link padrão (`openOnClick: true`); o Tiptap abre o link com `window.open(href, target)` sem `noopener`. Além disso, o schema aceita o JSON com `.loose()`: chamando a Server Action direto, um membro grava marca `link` com `class`/`target`/`rel` arbitrários e menção com `label` que não bate com a pessoa do `id`.",
     "`src/components/tasks/description-editor.tsx:24`\n```ts\nextensions: [StarterKit],\n```\n`src/lib/validation/tasks.ts:33`\n```ts\nconst descriptionJson = z.object({ type: z.literal(\"doc\") }).loose();\n```",
     "Página externa aberta pelo link troca a aba do ITC Tasks por um falso login; overlay de tela inteira com classes Tailwind levando a site externo; menção com nome falso.",
     "`StarterKit.configure({ link: { openOnClick: false } })` no editor editável (ou COOP, Issue 2). No service, normalizar o documento: manter só `href` na marca `link`, regravar o `label` da menção a partir do banco e limitar tamanho e profundidade.",
     ["Clicar num link no editor de descrição não abre aba com `window.opener`",
      "Server Action com marca `link` contendo `class` grava o documento sem `class`",
      "Menção com `label` falso é regravada com o nome real",
      "Documento acima do limite é recusado com erro de validação"]),
    ("[Segurança] main sem proteção no servidor; merge publica em produção com acesso ao grupo docker", "média", ["A03"],
     "No plano Free, `branches/main/protection` e `rulesets` respondem 403 e não há `environment` no `deploy.yml`. O único bloqueio de push na `main` é o hook local `.githooks/pre-push`, contornável. O deploy roda como `github-deploy`, membro do grupo `docker` no `glpi-srv`.",
     "`.github/workflows/deploy.yml:3-6`\n```yaml\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\n```\n`deploy.yml:15-19`: job `deploy` sem `environment:`.",
     "Conta comprometida de qualquer um dos 3 admins publica código arbitrário no host que também roda GLPI e RustDesk (grupo docker ≈ root).",
     "2FA obrigatório na organização; reduzir admins a quem precisa; avaliar GitHub Team para branch protection na `main` e environment `production` com revisor restrito à `main`. A chave SSH com `command=` forçado já limita o roubo da chave.",
     ["2FA obrigatório ligado na organização",
      "Lista de admins revisada e registrada no INFRA",
      "Decisão sobre GitHub Team registrada em ADR (e, se adotado, push direto na `main` recusado pelo GitHub)"]),
    ("[Segurança] Senha do admin do seed vai para o argv do sudo (auth.log)", "média", ["A04"],
     "O passo 5 do procedimento de implantação expande `SEED_ADMIN_PASSWORD` na linha de comando de `sudo -u github-deploy env …`. O sudo registra o `COMMAND=` completo e a senha aparece em `ps` e `/proc/*/cmdline`.",
     "`docs/INFRA.md:384`\n```sh\nsudo -u github-deploy env SEED_ADMIN_EMAIL=\"$SEED_ADMIN_EMAIL\" SEED_ADMIN_PASSWORD=\"$SEED_ADMIN_PASSWORD\" … docker compose exec -T -e SEED_ADMIN_PASSWORD …\n```",
     "A senha do primeiro admin pode estar em texto claro nos logs do `glpi-srv`, legível por root e pelo grupo `adm`.",
     "Conferir `sudo grep -c SEED_ADMIN_PASSWORD /var/log/auth.log*` e `journalctl _COMM=sudo | grep -c SEED_ADMIN`; se houver ocorrência, trocar a senha do admin pela tela. Reescrever o passo com `sudo --preserve-env=SEED_ADMIN_EMAIL,SEED_ADMIN_PASSWORD,SEED_ADMIN_NAME -u github-deploy …`.",
     ["Verificação dos logs feita e resultado registrado (sem o valor)",
      "Senha do admin trocada, se encontrada nos logs",
      "`docs/INFRA.md` sem senha expandida em argumento de comando"]),
    ("[Segurança] Web Push aceita endpoint arbitrário (SSRF cego com amplificação)", "baixa", ["A05", "A16"],
     "O schema aceita qualquer URL `https://` como endpoint; `/api/push/test` faz POST a todas as assinaturas da pessoa, sem limite, e devolve quantas responderam 2xx. Não há limite de assinaturas por pessoa. O upsert por `endpoint` também reatribui o `userId` (sem impacto prático: o endpoint é secreto).",
     "`src/lib/validation/notifications.ts:18`\n```ts\nendpoint: z.url().startsWith(\"https://\").max(2000),\n```\n`src/app/api/push/test/route.ts:8-9`\n```ts\nconst sent = await sendTestPush(actor);\nreturn Response.json({ sent }, { status: 202 });\n```",
     "Um membro usa o `glpi-srv` para sondar serviços HTTPS internos (127.0.0.1, 10.10.10.x) com oráculo de resposta, e multiplica requisições de saída.",
     "Aceitar só hosts de push service conhecidos (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`); limitar assinaturas por pessoa; limite de taxa no `/api/push/test`; no conflito de `endpoint` de outra pessoa, não reatribuir.",
     ["Endpoint `https://127.0.0.1/...` é recusado com 400",
      "Acima do limite de assinaturas por pessoa a inscrição é recusada",
      "`/api/push/test` responde 429 acima do limite",
      "Endpoint já de outra pessoa não muda de dono"]),
    ("[Segurança] Rotas POST com cookie sem checagem de Origin (CSRF entre subdomínios)", "baixa", ["A06"],
     "`/api/push/subscribe` lê `request.json()` sem conferir `Origin`, `Sec-Fetch-Site` nem `Content-Type`; `/api/attachments` (multipart) também não confere `Origin`. O cookie usa `SameSite=Lax`, que não barra requisições same-site de subdomínios irmãos em `itcbr.xyz`.",
     "`src/app/api/push/subscribe/route.ts:10`\n```ts\nconst row = await subscribePush(actor, await request.json());\n```",
     "Uma página comprometida em `monitor.`, `dash.` ou `notescan.itcbr.xyz` registra o endpoint do atacante na conta da vítima e passa a receber os pushes dela (TI-N e trechos de comentário).",
     "Helper único que recusa `Origin` diferente de `BETTER_AUTH_URL` (e exige `application/json` onde couber), aplicado em todos os `POST`/`DELETE` de `src/app/api/**` fora do Better Auth.",
     ["POST de outra origem recebe 403 em `/api/push/subscribe` e `/api/attachments`",
      "POST `text/plain` em `/api/push/subscribe` recebe 415 ou 400",
      "Teste de integração cobre as duas rotas"]),
    ("[Segurança] Limite de 60 req/min do /mcp contornável com lote JSON-RPC", "baixa", ["A07"],
     "O limite conta uma vez por requisição HTTP (`agentFromKey`), mas o SDK aceita array JSON-RPC de até 100 mensagens. Não há limite de tokens por pessoa.",
     "`src/app/mcp/route.ts:13`\n```ts\nconst agent = await agentFromKey(key);\n```\n`node_modules/@modelcontextprotocol/sdk/dist/esm/server/requestBody.js:4`\n```js\nexport const MAX_BATCH_SIZE = 100;\n```",
     "Até 6.000 chamadas de ferramenta por minuto por token, contra os 60 do ADR-009; carga no banco e escrita em massa por agente descontrolado.",
     "Recusar corpo em array no `route.ts` antes do `handleRequest` (400) e limitar tokens ativos por pessoa.",
     ["POST com array JSON-RPC no `/mcp` recebe 400",
      "Criar token acima do limite por pessoa é recusado",
      "Teste de integração da 61ª chamada continua recebendo 429"]),
    ("[Segurança] Endurecer validação de ambiente, compose e CI", "baixa", ["A10", "A11", "A12", "A13", "A17", "A18"],
     "Itens de configuração de baixo risco, agrupados: validação de env permissiva, `POSTGRES_PASSWORD` sem `:?`, portas do dev em todas as interfaces, `GITHUB_TOKEN` persistido no checkout, exigência de SHA desligada no repositório, imagens por tag e a pasta `Claude outputs/` fora do `.gitignore`.",
     "`src/lib/env.ts:9`\n```ts\nBETTER_AUTH_SECRET: z.string().min(32),\n```\n`docker-compose.yml:42`\n```yaml\n- POSTGRES_PASSWORD=${POSTGRES_PASSWORD}\n```\n`docker-compose.dev.yml:8,17`\n```yaml\nports: [\"5435:5432\"]\nports: [\"8025:8025\", \"1025:1025\"]\n```\n`.github/workflows/ci.yml:39,82,125`: `actions/checkout@3d3c…90b1` sem `persist-credentials: false`.",
     "Segredo de CI aceito em produção, erro de configuração silencioso, banco de dev exposto na rede local e token do CI ao alcance de scripts de instalação.",
     "Em produção, recusar segredos com prefixo `ci-`/`changeme`/`test`, exigir `https://` em `BETTER_AUTH_URL` e `SMTP_USER`/`SMTP_PASSWORD` em par; `${POSTGRES_PASSWORD:?defina no .env}`; `127.0.0.1:` nas portas do dev; `persist-credentials: false`; ligar `sha_pinning_required`; fixar imagens por digest; `Claude outputs/` no `.gitignore` e no `.dockerignore`.",
     ["Teste do `env.ts` recusa o segredo do CI com `NODE_ENV=production`",
      "`docker compose config` falha sem `POSTGRES_PASSWORD`",
      "`docker compose -f docker-compose.dev.yml ps` mostra portas só em 127.0.0.1",
      "Os três checkouts do CI com `persist-credentials: false`",
      "`git check-ignore \"Claude outputs/x\"` confirma a exclusão"]),
    ("[Segurança] Endpoints nativos do Better Auth contornam os services; SSE de membro desativado", "informativa", ["A14", "A15", "A21"],
     "Os endpoints `/api/auth/update-user` e `/api/auth/admin/*` (remove-user, set-role, impersonate-user, set-user-password) gravam sem passar pelos services e sem evento. O SSE confere a sessão só ao conectar. Itens menores: lookahead do `proxy.ts` sem delimitador e `version` no `/api/health`.",
     "`src/server/auth.ts:58-62` registra `admin({ defaultRole: \"member\", adminRoles: [\"admin\"] })` sem `disabledPaths`.\n`src/app/api/events/route.ts:8-9`\n```ts\nconst actor = await sessionActor();\nif (!actor) return new Response(null, { status: 401 });\n```",
     "Regras de negócio (ADR-018, `assertNotSelf`, limite de nome) e auditoria contornáveis por admin ou pela própria pessoa; membro desativado segue vendo metadados em tempo real.",
     "`disabledPaths` para `/update-user`, `/admin/remove-user`, `/admin/set-role`, `/admin/impersonate-user` e `/admin/set-user-password` (a UI já usa os services); reconferir a sessão a cada ping do SSE; delimitar o lookahead do proxy.",
     ["Os caminhos listados respondem 404 pelo `/api/auth`",
      "Membro desativado tem o SSE encerrado em até 30 s",
      "Telas de membros e conta continuam funcionando (E2E)"]),
]


def issue_md(n, it):
    title, sev, refs, prob, evid, imp, fix, acc = it
    return "\n".join([
        f"--- ISSUE {n} ---",
        f"## {title}",
        "",
        f"**Labels sugeridas:** `security`, `severidade:{sev}`",
        f"**Achados:** {', '.join(refs)}",
        "",
        "### Descrição",
        prob,
        "",
        "### Evidência",
        evid,
        "",
        "### Impacto",
        imp,
        "",
        "### Sugestão de correção",
        fix,
        "",
        "### Critérios de aceite",
        *[f"- [ ] {a}" for a in acc],
        f"--- FIM ISSUE {n} ---",
    ])


def write_issues_md():
    parts = [f"# Issues da auditoria de segurança — ITC Tasks ({DATE})", "",
             "Gerado por `gerar_relatorio.py`. Copie cada bloco para uma issue no GitHub; "
             "nenhuma foi criada automaticamente.", ""]
    parts += [issue_md(i, it) + "\n" for i, it in enumerate(ISSUES, 1)]
    with open(ISSUES_MD, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(parts))


# ── PDF ───────────────────────────────────────────────────────────────
def fonts():
    d = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
    for name, file in [("Sans", "DejaVuSans.ttf"), ("Sans-Bold", "DejaVuSans-Bold.ttf"),
                       ("Mono", "DejaVuSansMono.ttf")]:
        pdfmetrics.registerFont(TTFont(name, os.path.join(d, file)))
    pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold")


def charts(tmp):
    counts = Counter(f[1] for f in FINDINGS)
    sevs = [s for s in SEV if counts[s]]
    fig, ax = plt.subplots(figsize=(4.2, 3.4), dpi=200)
    ax.pie([counts[s] for s in sevs], colors=[SEV[s][0] for s in sevs], startangle=90,
           counterclock=False, wedgeprops={"width": 0.38, "edgecolor": "white", "linewidth": 2})
    ax.text(0, 0, f"{len(FINDINGS)}\nachados", ha="center", va="center", fontsize=13, weight="bold")
    ax.legend([f"{s.capitalize()} ({counts[s]})" for s in sevs], loc="center left",
              bbox_to_anchor=(0.98, 0.5), frameon=False, fontsize=9)
    ax.set_title("Achados por severidade", fontsize=11)
    donut = os.path.join(tmp, "donut.png")
    fig.savefig(donut, bbox_inches="tight")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.4, 3.0), dpi=200)
    labels = [CATS[c].split(". ", 1)[1] for c in CATS]
    left = [0] * len(CATS)
    for s in SEV:
        vals = [sum(1 for f in FINDINGS if f[2] == c and f[1] == s) for c in CATS]
        if any(vals):
            ax.barh(labels, vals, left=left, color=SEV[s][0], label=s.capitalize())
            left = [a + b for a, b in zip(left, vals)]
    strong = [sum(1 for x in STRENGTHS if x[0] == c) for c in CATS]
    ax.barh(labels, strong, left=[l + 0.25 for l in left], color=STRONG, alpha=0.35,
            label="Pontos fortes")
    ax.invert_yaxis()
    ax.set_xlabel("Quantidade")
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(fontsize=8, frameon=False, loc="lower right")
    ax.set_title("Achados e pontos fortes por categoria", fontsize=11)
    bars = os.path.join(tmp, "bars.png")
    fig.savefig(bars, bbox_inches="tight")
    plt.close(fig)
    return donut, bars


def build_pdf():
    fonts()
    S = {
        "h1": ParagraphStyle("h1", fontName="Sans-Bold", fontSize=17, leading=22, spaceAfter=10,
                             textColor=colors.HexColor("#006C72")),
        "h2": ParagraphStyle("h2", fontName="Sans-Bold", fontSize=12.5, leading=16, spaceBefore=10,
                             spaceAfter=6, keepWithNext=1, textColor=colors.HexColor("#1A2020")),
        "p": ParagraphStyle("p", fontName="Sans", fontSize=9.5, leading=13.5, spaceAfter=5),
        "small": ParagraphStyle("s", fontName="Sans", fontSize=8, leading=10.5),
        "cell": ParagraphStyle("c", fontName="Sans", fontSize=7.8, leading=10),
        "loc": ParagraphStyle("l", fontName="Mono", fontSize=6.8, leading=8.8),
        "code": ParagraphStyle("code", fontName="Mono", fontSize=7, leading=9,
                               backColor=colors.HexColor("#F3F4F6"), borderPadding=5,
                               leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=6),
        "cover": ParagraphStyle("cv", fontName="Sans-Bold", fontSize=24, leading=30,
                                textColor=colors.HexColor("#006C72")),
    }
    P = lambda t, s="p": Paragraph(t, S[s])  # noqa: E731

    def chip(sev):
        return Paragraph(f'<font color="white"><b>{sev.upper()}</b></font>',
                         ParagraphStyle("chip", fontName="Sans-Bold", fontSize=6.2, leading=9,
                                        alignment=1, backColor=colors.HexColor(SEV[sev][0]),
                                        borderPadding=(2, 2, 2, 2)))

    def deco(canvas, doc):
        canvas.saveState()
        canvas.setFont("Sans", 7.5)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        w, h = A4
        if doc.page > 1:
            canvas.drawString(2 * cm, h - 1.3 * cm, TITLE)
            canvas.drawRightString(w - 2 * cm, h - 1.3 * cm, DATE)
            canvas.line(2 * cm, h - 1.45 * cm, w - 2 * cm, h - 1.45 * cm)
        canvas.drawString(2 * cm, 1.2 * cm, "Grupo ITC Brasil · uso interno · confidencial")
        canvas.drawRightString(w - 2 * cm, 1.2 * cm, f"Página {doc.page}")
        canvas.restoreState()

    tmp = tempfile.mkdtemp()
    donut, bars = charts(tmp)
    counts = Counter(f[1] for f in FINDINGS)
    story = []

    # a) capa
    story += [Spacer(1, 3 * cm), P("Relatório de Auditoria de Segurança", "cover"),
              P("ITC Tasks", "cover"), Spacer(1, 0.6 * cm),
              P(f"<b>Data:</b> {DATE} &nbsp;&nbsp; <b>Commit auditado:</b> {COMMIT} &nbsp;&nbsp; "
                "<b>Módulo:</b> 13 — Auditoria de segurança"),
              P("<b>Escopo:</b> todo o repositório github.com/itc-brasil/itc-tasks — src/ (services, "
                "Server Actions, route handlers, MCP, componentes), public/sw.js, worker/, scripts/ "
                "(deploy, migração, importação do Windshift), seed, docker-compose* (dev e produção), "
                "Dockerfile, .env.example, .github/workflows (ci, security, deploy), docs/ e o histórico "
                "completo do Git (git log -p --all). Também os plugins usados em node_modules "
                "(Better Auth admin/apiKey, MCP SDK, Tiptap Link)."),
              Spacer(1, 0.4 * cm), P("Stack detectada", "h2"),
              P("TypeScript · Next.js 16.4 (App Router, Server Actions, route handlers) · React 19 · "
                "Drizzle ORM 0.45 sobre PostgreSQL 18 · Better Auth 1.7 (Argon2id, plugins admin e apiKey) · "
                "MCP SDK 1.32 (Streamable HTTP em /mcp) · pg-boss no worker · Tiptap 3 · nodemailer · "
                "web-push · Docker Compose no glpi-srv atrás de túnel Cloudflare · GitHub Actions."),
              P("Nota metodológica", "h2"),
              Table([[P("<b>Categoria</b>", "cell"), P("<b>Como foi mapeada para esta stack</b>", "cell")]] + [
                  [P(CATS[1], "cell"), P("Não há multi-tenant (time único). Isolamento = (a) admin × member nos services; "
                                         "(b) recursos pessoais (API keys, preferências, notificações, push, sessões, filtros) "
                                         "só do dono ou admin; (c) agente MCP limitado a tasks:read/tasks:write em nome do dono.", "cell")],
                  [P(CATS[2], "cell"), P("Cada gate de UI (isAdmin, role) cruzado com a Server Action, a rota e o service; "
                                         "regra ADR-003: a checagem deve estar no service.", "cell")],
                  [P(CATS[3], "cell"), P("Todas as Server Actions, os 8 route.ts e as ferramentas MCP que recebem id; "
                                         "tarefas são da equipe por design, então só recursos com dono contam.", "cell")],
                  [P(CATS[4], "cell"), P("Busca em código, configs, compose, CI, scripts, docs e git log -p; "
                                         "defaults ${VAR:-x}, validação de startup (env.ts), NEXT_PUBLIC_ no bundle. "
                                         "Valores sempre mascarados.", "cell")],
                  [P(CATS[5], "cell"), P("dangerouslySetInnerHTML/innerHTML/eval, render do Tiptap (JSON × HTML), "
                                         "protocolos de link, conteúdo do Windshift, anexos, e-mail, web-push, "
                                         "GLPI_BASE_URL e cabeçalhos HTTP.", "cell")],
              ], colWidths=[4.6 * cm, 12.4 * cm], style=TableStyle([
                  ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                  ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E6F4F4")),
                  ("VALIGN", (0, 0), (-1, -1), "TOP")])),
              Spacer(1, 0.3 * cm),
              P("Só achados verificados no código real, com arquivo e linha. A auditoria não corrigiu nada; "
                "cada correção vira issue (seção final).", "small"),
              PageBreak()]

    # b) resumo executivo
    sev_row = [[chip(s) for s in SEV], [P(f"<b>{counts[s]}</b>", "p") for s in SEV]]
    story += [P("Resumo executivo", "h1"),
              P(f"Foram verificados <b>{len(FINDINGS)} achados</b>: nenhum crítico, nenhum alto, "
                f"{counts['média']} médios, {counts['baixa']} baixos e {counts['informativa']} informativos, "
                f"além de <b>{len(STRENGTHS)} pontos fortes</b> com evidência. <b>Nenhum segredo real foi "
                "encontrado no repositório nem no histórico do Git.</b> O desenho de autorização (ADR-003) se "
                "sustenta: todas as escritas privilegiadas checam o papel no service. Os riscos médios estão nas "
                "bordas — endpoints nativos de plugins do Better Auth, cabeçalhos HTTP ausentes e a cadeia de "
                "deploy sem proteção no servidor do GitHub."),
              Table(sev_row, colWidths=[3.4 * cm] * 5, style=TableStyle([
                  ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")])),
              Spacer(1, 0.3 * cm), Image(donut, width=11 * cm, height=8.2 * cm),
              Image(bars, width=16 * cm, height=7.4 * cm), PageBreak()]

    # c) pontos fortes e fracos
    story += [P("Pontos fortes", "h1")]
    for c in CATS:
        story.append(P(CATS[c], "h2"))
        story += [P(f'<font color="{STRONG}">●</font> {escape(t)}') for cat, t in STRENGTHS if cat == c]
    story += [P("Pontos fracos (riscos centrais)", "h1")]
    story += [P(f'<font color="{SEV["média"][0]}">●</font> {escape(t)}') for t in WEAK]
    story.append(PageBreak())

    # d) achados detalhados
    story.append(P("Achados detalhados por categoria", "h1"))
    for c in CATS:
        rows = sorted((f for f in FINDINGS if f[2] == c), key=lambda f: SEV[f[1]][1])
        story.append(P(CATS[c], "h2"))
        if not rows:
            story.append(P("Nenhum achado explorável. Ver pontos fortes desta categoria.", "small"))
            continue
        data = [[P("<b>Severidade</b>", "cell"), P("<b>Arquivo:linha</b>", "cell"), P("<b>Descrição</b>", "cell")]]
        for fid, sev, _, loc, desc, cond in rows:
            data.append([chip(sev), P(escape(loc).replace(" · ", "<br/>"), "loc"),
                         P(f"<b>{fid}.</b> {escape(desc)}<br/><i>Condição: {escape(cond)}</i>", "cell")])
        story.append(Table(data, colWidths=[2.6 * cm, 5.1 * cm, 9.3 * cm], repeatRows=1,
                           style=TableStyle([
                               ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                               ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
                               ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)])))
    story.append(PageBreak())

    # e) recomendações
    pc = {"P1": "#B91C1C", "P2": "#D97706", "P3": "#2563EB"}
    story.append(P("Recomendações priorizadas", "h1"))
    story.append(Table(
        [[Paragraph(f'<font color="white"><b>{p}</b></font>',
                    ParagraphStyle("pc", fontName="Sans-Bold", fontSize=8, alignment=1,
                                   backColor=colors.HexColor(pc[p]), borderPadding=2)),
          P(escape(t), "cell")] for p, t in RECS],
        colWidths=[1.4 * cm, 15.6 * cm],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                          ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
                          ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)])))
    story.append(PageBreak())

    # f) issues
    story += [P("ISSUES PARA O GITHUB", "h1"),
              P("Texto completo em Markdown, pronto para colar. O mesmo conteúdo está em "
                "docs/security-audit/issues.md.", "small")]
    for n, it in enumerate(ISSUES, 1):
        md = escape(issue_md(n, it)).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
        story += [KeepTogether([P(f"Issue {n} · {escape(it[0])}", "h2")]), Paragraph(md, S["code"])]

    doc = SimpleDocTemplate(PDF, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm, title=TITLE,
                            author="Grupo ITC Brasil — TI")
    doc.build(story, onFirstPage=deco, onLaterPages=deco)


def render():
    import pymupdf as fitz

    out = os.path.join(HERE, "_render")
    os.makedirs(out, exist_ok=True)
    with fitz.open(PDF) as d:
        for i, page in enumerate(d, 1):
            page.get_pixmap(dpi=80).save(os.path.join(out, f"p{i:02d}.png"))
        print(f"{d.page_count} páginas rasterizadas em {out}")


if __name__ == "__main__":
    write_issues_md()
    build_pdf()
    print(f"OK: {PDF}\nOK: {ISSUES_MD}")
    if "--render" in sys.argv:
        render()
