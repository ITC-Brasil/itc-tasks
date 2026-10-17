# Módulo 00 — Fundação

**Concluído em:** 2026-10-17 · **Branch:** `develop` · **Status:** aprovado pelo Cowork (M-002) com os ajustes de M-002 e M-003 aplicados

## O que foi implementado

### Ambiente e scaffold

- `.npmrc` — `save-exact=true` e `engine-strict=true` (ADR-031).
- `package.json` — `engines.node: ">=24.22.0 <25"`; scripts `dev`, `build`, `start`, `lint`,
  `typecheck` (`next typegen && tsc --noEmit`), `db:generate`, `db:migrate`, `db:studio`, `test`,
  `test:unit`, `test:integration`, `test:coverage`, `test:e2e`, `format`, `format:check`.
- Scaffold do `create-next-app@16.4.2` (App Router, `src/`, npm) gerado numa pasta temporária e
  trazido para a raiz. Os SVGs de demonstração e o `src/app/favicon.ico` do Next ficaram de fora,
  porque esconderiam o `public/favicon.ico` da marca.
- `next.config.ts` — `output: "standalone"`, `cacheComponents: true`, `partialPrefetching: true`
  (os dois últimos são padrão do scaffold do Next 16.4).
- `AGENTS.md` — bloco que o próprio `next dev` recria; versionado para manter a árvore limpa.
- TypeScript lado a lado (ADR-032): `"@typescript/native": "npm:typescript@7.0.2"` fornece o `tsc`
  e `"typescript": "npm:@typescript/typescript6@6.0.2"` (binário `tsc6`) atende o typescript-eslint.

### Design System

- `src/styles/globals.css` — tokens de `project/tokens.json` do Design System, claro em
  `:root, [data-theme="light"]` e escuro em `[data-theme="dark"]`; variante `dark:` ligada a
  `[data-theme="dark"]`.
- Mapeamento no `@theme inline` por namespace do Tailwind 4: `--background-color-{base,surface,muted}`
  e `--text-color-{base,muted}`. Assim `bg-muted` (`#EBE4D8`) e `text-muted` (`#697272`) são cores
  diferentes, e `text-base` é a cor do texto. O tamanho `text-base` do Tailwind foi anulado
  (`--text-base: initial`).
- Escala tipográfica como utilitários: `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`,
  `text-task-title`, `text-small`, `text-caption`, e `@utility tech` (13px/500 com `tabular-nums`).
- Raios `rounded-{sm,md,lg,control,xl,dialog}` (4/6/8/9/12/13px), sombras `shadow-1`/`shadow-2`,
  medidas `h-control-{sm,md,lg}` (30/38/44px), `row-height`, `sidebar-width` (236px),
  `sidebar-collapsed` (64px), `topbar-height` (60px), `column-width` (300px).
- Variáveis do shadcn mapeadas (`--color-background`, `--color-primary` = `accent` etc.). O `accent`
  do shadcn **não** é mapeado: aqui `accent` é o ciano.
- Base: `.lucide { stroke-width: 1.75 }`, foco `outline-2 outline-offset-2 outline-accent`, e
  `prefers-reduced-motion` zerando animações.
- `src/app/layout.tsx` — Inter (`--font-inter`) e Archivo 600/800 (`--font-archivo`) por
  `next/font/google`, `lang="pt-BR"`, `data-theme="light"` fixo (o tema do usuário chega no Módulo 02).

### Componentes base (shadcn 4.22.0, estilo `base-nova`, Base UI)

- `components.json` e `src/components/ui/{button,input,select,dialog,checkbox,switch,tooltip,popover,dropdown-menu,sonner}.tsx`.
- `src/lib/utils.ts` — `cn()` com `clsx` + `tailwind-merge`. O shadcn 4.22 gera `import { cn } from "cn"`
  (pacote `cn@0.5.0`, fora da stack); os imports foram trocados para `@/lib/utils` e o pacote removido.
- Restilização pelos tokens: botão primário `bg-accent text-on-accent font-semibold`, hover
  `accent-hover`, pressionado `accent-pressed`; secundário `bg-surface` + `border` + `shadow-1`;
  ghost `text-accent-text` com hover `accent-light`; perigo `bg-err`; alturas `control-sm/md/lg`.
  Inputs e select com `rounded-control`, `bg-surface` e `shadow-1`; input com `text-[16px]` para o
  iOS não dar zoom. Menus com foco `bg-muted` (antes `bg-accent`), popups `shadow-2` com
  `ring-border`, diálogo `rounded-dialog` com overlay `bg-muted/70`. As classes
  `dark:bg-input/*` foram removidas porque cobriam `bg-surface` no escuro.
- `src/app/page.tsx` — vitrine provisória dos tokens (marcada `ponytail:`), substituída no Módulo 02.

### Banco

- `docker-compose.dev.yml` — `postgres:18.6-alpine` em `5435:5432` e `axllent/mailpit:v1.31.6`
  em `8025`/`1025`. Volume em `/var/lib/postgresql` (ver Pontos de atenção).
- `scripts/db-init/01-test-db.sql` — cria `itc_tasks_test` no primeiro start do volume.
- `drizzle.config.ts` — schema `./src/db/schema/index.ts`, saída `./drizzle`; lê o `.env` com
  `process.loadEnvFile()` quando existe.
- `src/db/index.ts` — `Pool` do `pg` + `drizzle(pool, { schema })`; exporta `db` e `pool`.
- `src/db/schema/index.ts` — vazio; os schemas entram a partir do Módulo 01.
- `drizzle/0000_base.sql` (migração custom) — `CREATE EXTENSION unaccent`, função
  `unaccent_immutable(text)` (`IMMUTABLE PARALLEL SAFE STRICT`) e `task_number_seq START 1`.

### Ambiente tipado

- `src/lib/env.ts` — `@t3-oss/env-nextjs`. Obrigatórias: `DATABASE_URL`, `BETTER_AUTH_SECRET`
  (mín. 32), `BETTER_AUTH_URL`, `GLPI_BASE_URL`. Com padrão: `APP_TIMEZONE`
  (`America/Sao_Paulo`), `UPLOADS_DIR` (`/data/uploads`). Opcionais até o módulo que as usar:
  `DATABASE_URL_TEST`, `SEED_ADMIN_*`, `VAPID_*`, `SMTP_*`, `MAIL_FROM`.
  `SKIP_ENV_VALIDATION=1` pula a validação (usado no `docker build`).
- `.env.example` — todas as variáveis de `docs/ARCHITECTURE.md`, com os valores do Mailpit para
  desenvolvimento.

### Testes

- `vitest.config.ts` — projetos `unit` (`src/**/*.test.{ts,tsx}`) e `integration`
  (`tests/integration/**/*.test.ts`, `fileParallelism: false`); cobertura v8 sobre `src/**`.
- `tests/integration/test-db.ts` — recusa rodar se `DATABASE_URL_TEST` não apontar para
  `/itc_tasks_test`. `global-setup.ts` aplica as migrações com o migrator do `drizzle-orm`;
  `setup.ts` troca `DATABASE_URL` pelo banco de teste antes dos imports.
- `src/lib/utils.test.ts`, `tests/integration/db.test.ts`.
- `playwright.config.ts` — projetos `desktop` (Desktop Chrome) e `mobile` (Pixel 7); sobe
  `npm run dev`. `tests/e2e/home.spec.ts` com axe (`@axe-core/playwright`).
- `eslint.config.mjs` — `eslint-config-next` (core-web-vitals + typescript) e
  `eslint-plugin-security` (recommended). `.prettierrc.json` (`printWidth: 100`), `.prettierignore`.

### CI

- `.github/workflows/ci.yml` — job **Quality Check**: Postgres de serviço `postgres:18.6-alpine`,
  Node 24.22.0 + npm 11.19.1, `npm ci`, `typecheck`, `lint`, `format:check`, `db:migrate`,
  `test:coverage`, `build`, `npm audit --omit=dev --audit-level=high`.
- `.github/workflows/security.yml` — Gitleaks no histórico inteiro (push, PR e segunda às 09:00 UTC)
  pela imagem `ghcr.io/gitleaks/gitleaks` v8.30.1 fixada por digest
  (`sha256:c00b6bd0…bbb7f`).
- Ações fixadas por SHA: `actions/checkout@3d3c42e…` (v7.0.1), `actions/setup-node@949feb2…` (v7.1.0).
- `.github/dependabot.yml` — `npm` e `github-actions`, semanal, alvo `develop`, só minor/patch,
  máx. 5 PRs cada.

### Produção

- `scripts/migrate.mjs` → `dist/migrate.mjs` na imagem: migrator do `drizzle-orm` com `DATABASE_URL`.
- `scripts/docker-entrypoint.sh` — `set -e`; `node dist/migrate.mjs` e depois `exec node server.js`.
- `Dockerfile` — três estágios em `node:24.22.0-alpine` (`deps` com `npm ci`, `builder` com
  `next build`, `runner` com usuário `app`, `/data/uploads`, `EXPOSE 3000`). Copia o pacote
  `drizzle-orm` inteiro e a pasta `drizzle/` para o runner.
- `.dockerignore` — fora da imagem: `.git`, `.conversa`, `.env*`, `docs`, `tests`, `node_modules`.
- `docker-compose.yml` — `itc-tasks` (`127.0.0.1:3021:3000`), `itc-tasks-worker` (perfil `worker`)
  e `itc-tasks-db`; `container_name`, `restart: always`, `TZ=America/Sao_Paulo`, sem label do
  Watchtower, senha só via `${POSTGRES_PASSWORD}` do `.env`.
- `src/app/api/health/route.ts` — `GET` dinâmico (`await connection()`), `select 1`; 200
  `{ db: "ok", version }`, 503 `{ db: "down", version }`.

## Verificação realizada

| Cenário | Como | Resultado |
|---|---|---|
| Typecheck com TS 7 | `npm run typecheck` | ✅ sem erros (`tsc` 7.0.2) |
| Lint com typescript-eslint + security | `npm run lint` | ✅ 0 problemas |
| Formatação | `npm run format:check` | ✅ |
| Build standalone | `npm run build` | ✅ `/` estático, `/api/health` dinâmico |
| Tokens geram as classes certas | grep no CSS do build | ✅ `.text-base{color:var(--text-base)}`, `.bg-muted{background-color:var(--bg-muted)}`, `.text-muted{color:var(--text-muted)}` |
| Componentes nos dois temas | navegador, `data-theme` claro e escuro | ✅ fundo escuro `rgb(20, 25, 24)` = `#141918` |
| Migração base nos dois bancos | `npm run db:migrate` + migrate no `itc_tasks_test` | ✅ `unaccent_immutable('Ação')` = `Acao`; `nextval` = 1 |
| Unit + integração | `npm test` | ✅ 2 arquivos, 2 testes |
| Guarda do banco de teste | `tests/integration/test-db.ts` | ✅ só aceita `/itc_tasks_test` |
| E2E + axe | `npm run test:e2e` | ✅ desktop e mobile, com `color-contrast` ligado depois do ADR-035 |
| Lockfile aceito pelo `npm ci` | `npm ci` local | ✅ (avisos de peer do eslint 10) |
| CI no GitHub | push em `develop` (run 39010702627) | ✅ Quality Check verde |
| Gitleaks | local e run 39010702629 | ✅ 9 commits, nenhum vazamento |
| Imagem de produção | `docker build` + container contra o Postgres local | ✅ migrações aplicadas, `/api/health` 200 |
| Health com banco fora | `npm run start`, `docker stop` do Postgres | ✅ 503 `{"db":"down","version":"0.1.0"}` |
| Auditoria de produção | `npm audit --omit=dev --audit-level=high` | ✅ 0 vulnerabilidades |
| Proteção da `main` no GitHub | `gh api -X PUT …/branches/main/protection` | ❌ HTTP 403: exige GitHub Pro/Team em repositório privado → ADR-034 |
| Hook `pre-push` | `git push --dry-run origin develop:main` / `develop` / com `ALLOW_MAIN_PUSH=1` | ✅ recusa a `main`; `develop` e emergência passam |

## Decisões

ADR-032 a ADR-036 — ver `docs/DECISIONS.md`:
- ADR-032 — TypeScript 7 lado a lado com o TypeScript 6 para as ferramentas.
- ADR-033 — Ajustes de CI: `npm audit --omit=dev` e Gitleaks pela imagem fixada por digest (altera o ADR-029).
- ADR-034 — Proteção da `main` por disciplina: hook `.githooks/pre-push` + `git config core.hooksPath .githooks` (altera o ADR-029).
- ADR-035 — Contraste: `text-muted` `#636C6C` e token `accent-solid` `#007A80` no claro; `color-contrast` do axe religado.
- ADR-036 — `cacheComponents` e `partialPrefetching` ligados.
- Sem ADR: volume do Postgres 18 em `/var/lib/postgresql` (nota em `docs/INFRA.md` §3); worker em perfil até o Módulo 08.

## Dependências entre módulos

- **01 Autenticação:** `src/lib/env.ts` já valida `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`; o schema
  do Better Auth entra em `src/db/schema/auth.ts` reexportado por `src/db/schema/index.ts`.
- **02 Layout:** substitui `src/app/page.tsx` e o `data-theme="light"` fixo do `layout.tsx`; monta
  `Toaster` e `TooltipProvider`.
- **04 Tarefas:** `tasks.number` usa `task_number_seq` e `tasks.search` usa `unaccent_immutable`.
- **08 Notificações:** cria `worker/index.js`, tira o perfil `worker` do `docker-compose.yml` e
  acrescenta `queue` ao `/api/health`; torna `VAPID_*`/`SMTP_*` obrigatórias.
- **11 PWA:** `src/app/manifest.ts` a partir de `docs/brand/manifest.webmanifest`; auditoria de contraste.
- **12 Deploy:** `scripts/deploy.sh` e `deploy.yml` usam o `docker-compose.yml` e o `/api/health`.

## Pontos de atenção

- **Proteção da `main` por disciplina (ADR-034).** O GitHub Free não protege branch em repositório
  privado. O hook `.githooks/pre-push` só vale onde `git config core.hooksPath .githooks` foi
  rodado, e não cobre a interface web nem `--no-verify`.
- **Postgres 18 mudou o PGDATA** para `/var/lib/postgresql/18/docker`. O volume vai em
  `/var/lib/postgresql`; montar em `/var/lib/postgresql/data` (como no rascunho do INFRA) faz a
  imagem 18 recusar iniciar. `docs/INFRA.md` §6.2 e `docs/ARCHITECTURE.md` foram corrigidos.
- **`npm audit --audit-level=high` sem `--omit=dev` falha** por `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm,
  sem versão corrigida) via `eslint-config-next`, `shadcn` e `@ts-morph`, e `esbuild` via
  `drizzle-kit`. São só ferramentas de dev; o CI audita as dependências de produção.
- **Peer do eslint:** `eslint-config-next@16.4.2` traz plugins que declaram `eslint@^9`; com o
  `eslint@10.13.0` o npm avisa (ERESOLVE overriding) mas instala e o lint roda.
- **`shadcn` em `devDependencies`:** só o `shadcn/tailwind.css` é usado, no build. Em
  `dependencies` ele levava a cadeia do `braces` para a auditoria de produção.
- **Contraste (ADR-035):** superfície com `on-accent` usa `bg-accent-solid`, nunca `bg-accent`;
  `--color-primary` aponta para `accent-solid`. O E2E cobre só o tema claro; o escuro entra na
  auditoria do Módulo 11.
- **`cacheComponents` (ADR-036):** leitura de banco fora de `<Suspense>` precisa de `await connection()`
  ou outro sinal de requisição.
- **Cobertura sem limite mínimo** em `vitest.config.ts` (hoje 5,4% de linhas, só a vitrine e o
  `cn()`). Definir limites quando houver services (Módulo 03/04).
- **`@theme inline` não emite variáveis:** utilitários próprios (`@utility tech`) usam valores
  literais, não `var(--text-tech)`.
- **`npm` global antigo:** nesta máquina havia um `npm@11.7.0` em `%APPDATA%\npm` que vencia o npm
  do Node; foi atualizado para 11.19.1 com `npm install -g npm@11.19.1`.

## Commits

```
9ca167e docs: add adr-032 typescript 7 side by side with typescript 6
cb6366f chore: scaffold next.js app
9c4bab5 feat(ui): add design system tokens
5a80242 feat(ui): add base components on base ui
969cb1d chore: add typed env
56c88bc feat(db): add drizzle setup and base migration
a63ee27 test: add test tooling
9ef5a6b style: apply prettier
d0fa7f1 ci: add quality check and security workflows
4482c7e feat(db): run migrations on container start
86a67a7 chore: add production docker setup
33ea60d feat(api): add health endpoint
ea52a4b fix(api): match health payload to api contract
```

Ajustes da revisão (M-002 e M-003):

```
6e0d88b docs: add adr-033 ci adjustments
2fd6a82 docs: add adr-034 main protection by discipline
064b1bd docs: add adr-035 token contrast adjustment
1685b66 fix(ui): raise contrast of muted text and primary surfaces
1cf6b73 docs: add adr-036 cache components
76bd9fb chore: add preview launch config
```

Antes do módulo, na `main`: `a6435d3 docs: add initial documentation and brand assets`.
Fechamento: `docs: document module 00 foundation`.
