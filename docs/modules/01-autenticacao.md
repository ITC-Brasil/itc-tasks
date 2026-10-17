# Módulo 01 — Autenticação e membros

**Concluído em:** 2026-10-17 · **Branch:** `develop` · **Status:** aprovado pelo Cowork (M-007) com os ajustes abaixo aplicados

## O que foi implementado

### Ajuste pedido na M-005

- `src/styles/globals.css` — token `--accent-solid-pressed` (claro `#005e63`, escuro
  `var(--accent-pressed)`) e `--color-accent-solid-pressed` no `@theme`.
- `src/components/ui/button.tsx` — primário com `active:bg-accent-solid-pressed`.
- `tests/e2e/tokens.spec.ts` — o axe não avalia `:active`; o teste cria um elemento de prova com
  `color: var(--on-accent)` e `background: var(--accent-solid-pressed)`, lê o `rgb()` computado e
  exige contraste ≥ 4,5 (branco sobre `#005E63` ≈ 7,4:1).

### Better Auth

- Dependências: `better-auth` 1.7.10, `@better-auth/api-key` 1.7.10 (o plugin `apiKey` saiu do
  pacote principal), `@node-rs/argon2` 2.2.2.
- `src/server/auth.ts`:
  - `baseURL: env.BETTER_AUTH_URL`; `trustedOrigins: [env.BETTER_AUTH_URL, "https://tasks.itcbr.xyz"]`.
  - `emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 }` com
    `password.hash/verify` pelo `@node-rs/argon2`: `algorithm: 2` (Argon2id), `memoryCost: 19456`,
    `timeCost: 2`, `parallelism: 1` (ADR-008).
  - `drizzleAdapter(db, { provider: "pg", schema })`.
  - `admin({ roles: { admin: adminAc, member: userAc }, defaultRole: "member", adminRoles: ["admin"] })` (ADR-037).
  - `apiKey({ defaultPrefix: "itct_", rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 60 } })` —
    configurado agora; as ferramentas MCP chegam no Módulo 07 (ADR-009).
  - `nextCookies()` por último na lista de plugins.
  - `user.additionalFields` com `input: false` (só o app grava): `initials`, `theme` (`light`),
    `sidebarCollapsed` (`false`), `quietHoursStart` (`08:00`), `quietHoursEnd` (`18:00`),
    `emailDigest` (`true`). `role` vem do plugin `admin`, não de `additionalFields`.
  - `databaseHooks.user.create.before` preenche `initials` com `initialsOf(name)`.
- `src/lib/initials.ts` — "Matheus de Lima" → `ML`; nome de uma palavra → duas primeiras letras.
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)`.
- `src/lib/auth-client.ts` — `createAuthClient()` de `better-auth/react`, usado só na tela Entrar
  (o login passa pela rota HTTP e pelo rate limit do Better Auth).

### Banco

- `src/db/schema/auth.ts` — gerado por `npx auth@1.7.10 generate --config src/server/auth.ts
  --output src/db/schema/auth.ts` (o `@better-auth/cli` foi descontinuado; o CLI agora é o pacote
  `auth`). Tabelas `user`, `session`, `account`, `verification`, `apikey`. Não editar à mão.
- `src/db/schema/index.ts` — `export * from "./auth"`.
- `drizzle/0001_auth.sql` — as cinco tabelas do Better Auth.
- `drizzle/0002_user_preferences.sql` — seis `ALTER TABLE "user" ADD COLUMN` (só aditivo).

### Proteção de rotas e `Actor`

- `src/proxy.ts` — checagem otimista: sem o cookie de sessão (`getSessionCookie`) redireciona para
  `/login`. `matcher` exclui `login`, `api`, `mcp`, `_next` e os estáticos da marca.
- `src/server/actor.ts`:
  - `type Actor` com `user`, `agent` (com `apiKeyId`), `automation` e `system` (ADR-003).
  - `requireActor()` — `auth.api.getSession({ headers })`; sem sessão ou com `banned` →
    `redirect("/login")`; devolve `{ kind: "user", userId, role }`.
  - `isAdmin(actor)` (`system` conta como admin), `assertAdmin(actor)` → `ForbiddenError`.
- `src/app/(app)/layout.tsx` — `SessionGate` chama `requireActor()` dentro de `<Suspense>`
  (ADR-036) e monta o `<Toaster />`.
- `src/app/page.tsx` → `src/app/(app)/page.tsx` (a vitrine dos tokens agora exige sessão).

### Tela Entrar

- `src/app/(auth)/login/page.tsx` — card `bg-surface` `shadow-2` com o lockup
  `/brand/itc-tasks-horizontal-principal.svg`, título "Entrar".
- `src/app/(auth)/login/login-form.tsx` — `authClient.signIn.email`; mensagens: "E-mail ou senha
  incorretos.", "Sua conta está desativada. Fale com um admin." (`BANNED_USER`), "Muitas tentativas.
  Aguarde um minuto e tente de novo." (429). Sucesso → `router.replace("/")`.

### Seed

- `src/db/seed.mjs` — JS puro (`pg` + `@node-rs/argon2`), transação, `ON CONFLICT (email) DO
  NOTHING`; cria o usuário `Administrador` (`role = 'admin'`, `initials = 'AD'`) e a conta
  `credential` com o hash Argon2id. Exige `SEED_ADMIN_PASSWORD` com 12+ caracteres.
- `package.json` — `"db:seed": "node --env-file-if-exists=.env src/db/seed.mjs"`.
- `Dockerfile` — copia o seed para `dist/seed.mjs`; em produção:
  `docker compose exec itc-tasks node dist/seed.mjs`.

### Configurações › Membros

- `src/lib/validation/members.ts` — `createMemberSchema` (nome 2–80, e-mail normalizado em
  minúsculas, senha 12–128, papel `admin | member`).
- `src/server/services/members.ts` — `listMembers`, `createMember` (via `auth.api.createUser`, que
  faz o hash), `setMemberRole`, `setMemberActive` (ban + apaga as sessões na mesma transação). Todas
  chamam `assertAdmin(actor)`; papel e ativação recusam a própria conta (`MemberError`); e-mail
  repetido → `MemberError`.
- `src/server/actions/members.ts` — actions finas: `requireActor()` → Zod → service; mapeiam
  `MemberError`, `ForbiddenError` e `ZodError` para `{ ok: false, error }`; `revalidatePath`.
- `src/app/(app)/config/membros/page.tsx` — member vê "Você não tem acesso a esta área" com link
  para Minhas tarefas; admin vê a tabela. Dados dentro de `<Suspense>`.
- `src/app/(app)/config/membros/members-client.tsx` — diálogo "Criar membro" (`useActionState`),
  tabela com `Select` de papel e botão Desativar/Reativar; toasts no passado ("Membro criado",
  "Papel alterado", "Membro desativado"). A própria linha fica sem ações.
- `src/components/ui/dialog.tsx` — "Close" → "Fechar".

### Ajustes da revisão (M-007)

- **Redefinir senha** — `resetMemberPassword(actor, userId, password)` em
  `src/server/services/members.ts`: `assertAdmin`, `assertNotSelf`, `passwordSchema` (12–128,
  `src/lib/validation/members.ts`), hash por `(await auth.$context).password.hash` (o mesmo Argon2id
  do `auth.ts`) gravado na conta `credential` e sessões apagadas, tudo numa transação. O
  `auth.api.setUserPassword` sugerido exige sessão HTTP de admin (`adminMiddleware`) e o service só
  recebe o `Actor`, por isso o `$context`. Action `resetMemberPasswordAction`; na tela, botão
  "Redefinir senha" abre um diálogo; toast "Senha redefinida".
- **Alvo inexistente** — `setMemberRole`, `setMemberActive` e `resetMemberPassword` usam
  `.returning({ id })` e lançam `MemberError("Membro não encontrado")` quando nada muda.
- **Corrida no e-mail** — se o `auth.api.createUser` falhar, o service consulta o e-mail de novo;
  se já existir, lança o mesmo `MemberError("Já existe um membro com esse e-mail")`.
- **IP do cliente** — `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"]`
  em `src/server/auth.ts`; rate limit do Better Auth no padrão (só com `NODE_ENV=production`, que o
  `Dockerfile` define), em memória. Ver `docs/INFRA.md` §4.

## Verificação realizada

| Cenário | Como | Resultado |
|---|---|---|
| Login com senha certa (hash Argon2id) | `tests/integration/auth.test.ts` | ✅ 200; `initials = "MT"`, `role = "member"` |
| Senha errada | integração + E2E `auth.spec.ts` | ✅ 401; tela mostra "E-mail ou senha incorretos." |
| Cadastro público | integração + `curl POST /api/auth/sign-up/email` | ✅ 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED` |
| Membro desativado não entra; reativado entra | integração | ✅ 403 / 200 |
| Member cria, desativa ou troca papel | integração | ✅ `ForbiddenError` nos três |
| Admin altera a própria conta | integração | ✅ `MemberError` |
| E-mail duplicado | integração | ✅ `MemberError` |
| Rota protegida sem sessão | E2E (desktop e mobile) e `curl /` | ✅ 307 → `/login`, axe sem violações |
| Redefinir senha: member recusado, admin na própria conta recusado | integração | ✅ `ForbiddenError` / `MemberError` |
| Senha nova entra, antiga falha, sessões zeradas | integração | ✅ 200 / 401 / 0 sessões |
| Alvo inexistente (papel, ativação, senha) | integração | ✅ "Membro não encontrado" |
| Dois `createMember` simultâneos com o mesmo e-mail | integração (`Promise.allSettled`) | ✅ 1 criado, 1 `MemberError` |
| Redefinir senha pela tela | navegador (preview) | ✅ diálogo fecha, toast "Senha redefinida" |
| Admin entra e abre Membros | E2E com `SEED_ADMIN_*` | ✅ axe sem violações |
| Contraste `on-accent` × `accent-solid-pressed` | E2E `tokens.spec.ts` | ✅ ≥ 4,5 |
| Seed idempotente | `npm run db:seed` duas vezes | ✅ "criado" e depois "já existe" |
| Criar membro, trocar papel, reativar | navegador (preview) | ✅ diálogo fecha, tabela atualiza |
| Build | `npm run build` | ✅ `/` parcial (◐), `/login` estático, Proxy ativo |
| Lint, tipos, formatação, Vitest | `npm run lint`, `typecheck`, `format:check`, `npm test` | ✅ 16 testes (3 unit, 13 integração) |
| Argon2 na imagem `node:24-alpine` (ADR-008) | `docker build -t itc-tasks:m01 .` + `node -e` com `hash` no container | ✅ `$argon2id$v=19$m=19456,t=2,p=1` (binário musl do `@node-rs`) |
| Seed dentro da imagem | `node dist/seed.mjs` no container contra o Postgres de dev | ✅ "Admin admin@itcbr.test já existe." |

## Decisões

- **ADR-037** — papel `member` mapeado no plugin `admin`, desativar = `banned`, ninguém altera a
  própria conta, seed em JS puro.
- `@better-auth/api-key` como pacote separado e CLI `auth` no lugar de `@better-auth/cli`: não são
  escolhas, é onde o Better Auth 1.7 publica esses recursos.

## Dependências entre módulos

- Módulo 02 lê `theme` e `sidebarCollapsed` do usuário e troca a vitrine de `(app)/page.tsx`.
- Módulo 04 usa `requireActor()` nas actions e deve filtrar `banned = false` nos seletores.
- Módulo 07 converte a API key em `Actor { kind: "agent" }`; o plugin já está configurado.
- Módulo 08 lê `quietHoursStart/End` e `emailDigest`.

## Pontos de atenção

- **`cacheComponents` exige `<Suspense>` dentro de cada página que lê a sessão.** O `<Suspense>` do
  layout não basta: em dev o Next acusa "uncached data during prerendering or a navigation" e a
  primeira action da página é abortada. Padrão: `export default function Page() { return
  <Suspense><Conteudo /></Suspense> }` (ver `config/membros/page.tsx`).
- **Seed e `auth.ts` repetem os parâmetros do Argon2id.** Mudar um exige mudar o outro.
- **`role` é nulo no banco até o app gravar** (o `defaultRole` é aplicado pelo plugin, não por
  `DEFAULT` na coluna). Linhas inseridas por SQL precisam do `role` explícito, como no seed.
- **`ac: defaultAc` no `admin()` quebra a tipagem no TS 7.0.2** (variância de `newRole`); omitir.
- **Lightning CSS encurta `#ffffff` para `#fff`**: teste de cor lê `rgb()` computado, nunca o texto
  da variável.
- **`.env` de desenvolvimento** agora tem `SEED_ADMIN_EMAIL=admin@itcbr.test` e uma senha gerada
  localmente (fora do Git).

## Commits

```
39d31c1 fix(ui): restore pressed state on primary button
568e756 feat(auth): configure better auth with argon2id
3c7811f feat(auth): add user preference fields
94cd69c feat(auth): add login screen
3fe55e5 feat(auth): protect app routes
a76b39a feat(db): seed first admin
d251df6 feat(settings): add members management
9ba3797 test(auth): cover login and permissions
5763cef docs: document module 01 auth and members
a5a7bb1 security(auth): read client ip behind cloudflare tunnel
3f7fb81 feat(settings): add member password reset and guard missing or duplicate members
```
