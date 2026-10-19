# Módulo 12 — Migração do Windshift e implantação

Go-live do ITC Tasks em `https://tasks.itcbr.xyz` (18/10/2026), deploy automático pela `main`,
importação das tarefas abertas do Windshift e dois pedidos do Matheus depois de usar o app em
produção (descrição na criação rápida, edição do nome). Pedidos: M-071, M-072, M-074, M-076,
M-078, M-080, M-085, M-086 e M-087.

## O que foi implementado

### Parte C — go-live no `glpi-srv` (feita primeiro, a partir da `main`)

Executada por SSH com acesso temporário (sudoers `claude-code-golive`) e cada comando aprovado
pelo Matheus. As fases rodaram na ordem 1, 2, 3, 4, 6 e 5: a exportação veio antes da virada
(M-078). Os relatórios estão nas M-073 a M-084, sem segredos.

| Fase | O que mudou no servidor |
|---|---|
| 1 — Levantamento | Só leitura. Porta 3021 livre; Windshift `v0.8.9` em SQLite (`/data/windshift.db`, volume `windshift_windshift-data`), com `BASE_URL`/`WEBAUTHN_RP_ID` em `tasks.itcbr.xyz`; DNS de e-mail com SPF do Titan, DKIM `titan1`, DMARC `p=none` |
| 2 — Chaves | Deploy key só-leitura `~github-deploy/.ssh/itc_tasks_deploy` e `~github-deploy/.ssh/config` novo (`Host github-itc-tasks`). Chave do Actions no `authorized_keys` com `restrict,command=…`; a privada foi apagada com `shred` depois de ir para o secret. Secrets `DEPLOY_HOST`, `DEPLOY_PORT` (2222), `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` cadastrados pelo Matheus |
| 3 — Clone e `.env` | Clone pelo alias em `/home/glpissh/docker/itc-tasks`; `.env` gerado por script (`openssl rand`, VAPID pelo `web-push@3.6.7`), dono `github-deploy`, modo 600; `SMTP_PASSWORD` preenchida pelo Matheus |
| 4 — Build | O build da `main` falhou (abaixo) e passou depois do PR #14. Três containers rodando, migrações aplicadas, `/api/health` ok, SMTP autenticado (235). O Matheus rodou o seed |
| 6 — Exportação | Pela REST `/rest/api/v1` do Windshift, com token e só GET, em `/home/glpissh/windshift-export/` (700/600) com `LEIAME.md`; cópia `raw/windshift.db` pelo `backup()` do `node:sqlite`, sem parar o Windshift |
| 5 — Virada | `service` da rota `tasks.itcbr.xyz` de `localhost:3020` para `localhost:3021`; `cloudflared` reiniciado; item "ITC Tasks" na Homepage (`siteMonitor` no `/api/health`) |

**Windshift (opção 2 da M-080).** Pela tailnet (`tailscale serve --bg --http 3020`), o login pelo
navegador falha: a checagem de CSRF compara o `Origin` com o `BASE_URL`, fixo em
`tasks.itcbr.xyz` (403 `CSRF_ERROR` com qualquer outro `Origin`). O compose e o `.env` dele não
foram alterados. Ele fica como arquivo morto e será removido depois que a importação for
validada, com aprovação própria.

**Hotfix do build** (`a18ec0a`, PR #14): o `.dockerignore` exclui `tests/`, mas o
`playwright.config.ts` importa `./tests/e2e/session`, e o `next build` faz checagem de tipos de
todos os `**/*.ts`. O `playwright.config.ts` passou para o `.dockerignore`.

### Parte A — deploy automático

- `.github/workflows/deploy.yml` — `push` na `main` e `workflow_dispatch`, `concurrency:
  deploy-production` sem cancelar, `permissions: {}`, `timeout-minutes: 25`. `ssh` direto, sem
  action de terceiros, com `-o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes`
  (secret `DEPLOY_KNOWN_HOSTS`). Chave e `known_hosts` apagados em `if: always()`.
- `scripts/deploy.sh` — LF, `100755` no Git: `git pull --ff-only`, `docker compose up -d
  --build`, 30 × 5 s no `/api/health`, `docker image prune -f` só se der certo; se falhar,
  `docker compose logs --tail 50 itc-tasks itc-tasks-worker` e saída com erro. O comando
  forçado da chave já faz o `git pull` antes do script.
- `.github/workflows/ci.yml` — job **Docker build** (`docker build -t itc-tasks:ci .`), que pega
  o que só quebra com o `.dockerignore`.
- `docs/INFRA.md` — §2.4 (Windshift na tailnet), §4 (a rota já existia; só o `service` mudou),
  §6.1 (clone por alias), §6.3 (cuidados com o `.env`), §7.2/§7.3 (o que foi implementado),
  §10 itens 2, 5, 6 e 12, §11 (DMARC `p=none`).

### Parte B — importação do Windshift (ADR-056)

- `src/server/services/windshift-import.ts` — `loadExport(dir)` lê `items.json` e
  `custom-fields.json`. `importWindshift(actor, exp, { dryRun })` valida tudo numa transação e
  grava só se não houver erro.
  - Mapeamento explícito no código:
    - status `Backlog → backlog`, `Open → todo`, `In Progress`/`Aguardando → in_progress`; `Done` fica fora;
    - prioridade `critical → urgent`, `high`, `medium`, `low`;
    - Projeto/Cliente e UM pelos rótulos dos campos personalizados, com os apelidos `ITCBrasil → ITC` e `Mobility → MOBILITY`;
    - sem projeto → `ACL`;
    - responsável pelo e-mail, só membro ativo.
  - Epics não entram; a filha leva "Epic no Windshift: <título>".
  - A descrição vira parágrafos Tiptap, mais "Importada do Windshift — <chave> (ID <id>), criada em dd/mm/aaaa".
  - As `options` dos campos multiselect vêm como **texto JSON** na REST v1; o service aceita texto ou objeto.
- `src/server/services/tasks.ts` — `record(…, { silent })` não enfileira `fanout` nem
  `evaluate`; `insertTask(tx, actor, data, { silent, events })`. Só a importação passa a opção.
  Evento `imported` (`{ source, sourceId, key }`), mostrado em `activity.ts` como "importou do
  Windshift (TI-30)".
- `src/db/schema/tasks.ts` + `drizzle/0012_task_imports.sql` — `task_imports (task_id PK,
  source, source_id, imported_at)` com `task_imports_source_uq` em `(source, source_id)`. Aditiva.
- `scripts/import-windshift.ts` → `dist/import-windshift.mjs` (`npm run import:build`, esbuild
  como o worker), copiado na imagem pelo `Dockerfile`. A saída traz a prévia em tabela (origem,
  título, projeto, UM, status, prioridade, responsável) e o relatório: a importar, importadas,
  puladas, em ACL, ignoradas, sem responsável e erros. Código de saída 1 se houver erro.

**Runbook em produção** (depois do merge, com o `--dry-run` revisado pelo Matheus). Rodar como
`glpissh`, na pasta do app:

```bash
cd /home/glpissh/docker/itc-tasks
# 1. Cópia pontual do banco (INFRA §9)
sudo -u github-deploy docker compose exec -T itc-tasks-db pg_dump -U itc_tasks -d itc_tasks -Fc > ~/itc-tasks-antes-import-$(date +%Y%m%d-%H%M).dump
# 2. Prévia e importação com o UID/GID do glpissh (M-089)
U="$(id -u):$(id -g)"
sudo -u github-deploy docker compose run --rm --no-deps --user "$U" -v /home/glpissh/windshift-export:/import:ro itc-tasks node dist/import-windshift.mjs /import --dry-run
sudo -u github-deploy docker compose run --rm --no-deps --user "$U" -v /home/glpissh/windshift-export:/import:ro itc-tasks node dist/import-windshift.mjs /import
```

**Por que `--user`:** a exportação é do `glpissh`, com a pasta em 700 e os arquivos em 600. O
container roda como `app` (uid 100), que não conseguiria ler o `/import` ("permission denied").
Com `--user "$(id -u):$(id -g)"`, o `$(…)` é avaliado pelo shell do `glpissh` antes do `sudo`, e
o processo no container vira o dono da exportação. Assim a original não muda de permissão e
não sobra cópia para apagar. O script só lê `/import` e fala com o banco pela rede: o
`dist/import-windshift.mjs` é 644 e as pastas da imagem são 755, legíveis por qualquer usuário.
O `--no-deps` evita que o `run` mexa no `itc-tasks-db`, que já está no ar. O `:ro` garante que
o container não altera a exportação.

Antes do `apply`, o Matheus cria os membros Anne e Matheus Santos com o mesmo e-mail do Windshift
(responsável não encontrado vira "sem responsável", sem bloquear). O item do workspace pessoal
`P7` fica fora: o Matheus cria à mão.

### Parte D — descrição na criação rápida (M-086)

- `src/components/tasks/description-editor.tsx` — o mesmo editor do detalhe passa a aceitar
  `onChange` (vazio = `null`), `onModEnter` (⌘↵/Ctrl+Enter chama e não insere quebra) e
  `autoFocus`. O detalhe só passa `onSave` e não mudou.
- `src/components/tasks/quick-create.tsx`:
  - O campo fica fechado até "+ Adicionar descrição" e tem o rótulo visível "Descrição".
  - O foco continua no título ao abrir.
  - Um template com `descriptionJson` abre o campo preenchido; a chave `desc.key` remonta o editor.
  - "Criar outra" limpa a descrição.
  - O formulário ignora o ⌘↵ que o editor já tratou (`e.defaultPrevented`).
  - O diálogo rola no desktop (`sm:max-h-[90dvh] sm:overflow-y-auto`), como o painel inferior no mobile.
- `docs/UI.md` §4 atualizado.

### Parte E — nome de exibição (M-087)

- `src/server/services/members.ts` — `setMemberName(actor, userId, name)`: a pessoa troca o
  próprio nome e o admin troca o de qualquer um; agente nunca (`ForbiddenError`). Usa
  `displayNameSchema` (`src/lib/validation/members.ts`: trim, 1 a 80) e recalcula as iniciais
  com `initialsOf` (`src/lib/initials.ts`). Sem migração.
- `src/server/actions/members.ts` — `setMemberNameAction` e `setMyNameAction`;
  `revalidatePath("/", "layout")` para o avatar do shell.
- Telas: card **Perfil** com o campo Nome em Minhas preferências; diálogo **Editar nome** em
  todas as linhas de Configurações › Membros.
- `src/db/seed.mjs` — `SEED_ADMIN_NAME` opcional (padrão "Administrador"), com as iniciais pela
  mesma regra; `.env.example` e INFRA §10 item 5.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Imagem com o `.dockerignore` | `docker build` local antes do PR #14 | ✅ |
| Produção no ar | `curl https://tasks.itcbr.xyz/api/health` depois da virada | ✅ `{"db":"ok","queue":"ok","version":"0.1.0"}` |
| Outros subdomínios do túnel | `curl` em notescan, ntfy, n8n, dash, monitor, share | ✅ 200/302/307 |
| SMTP do Titan | `AUTH PLAIN` no container do worker | ✅ 235 |
| Cópia do SQLite do Windshift | `PRAGMA integrity_check` na cópia | ✅ ok, 278 tabelas, 29 itens |
| Importação: só abertas, Epic fora com a linha na filha, prioridade, histórico `created` + `imported` como `system` | `tests/integration/windshift-import.test.ts` | ✅ |
| Importação silenciosa | mesmo teste: 0 jobs `notification.fanout`/`automation.evaluate` para os eventos importados; controle com `createTask` comum > 0 | ✅ |
| Sem projeto → ACL; responsável desconhecido não bloqueia | idem | ✅ |
| Erro em uma tarefa não grava nenhuma (projeto desconhecido, UM fora do projeto, status sem mapeamento) | idem | ✅ |
| `--dry-run` não grava; segunda execução pula | idem | ✅ |
| Exportação real contra o banco de dev | `node --env-file=.env dist/import-windshift.mjs data/windshift --dry-run` | ✅ 15 a importar, 4 Epics ignoradas, 0 erros |
| Nome: membro troca o próprio, não o de outro; admin troca; agente não; vazio/espaços/81 recusados; iniciais recalculadas | `tests/integration/members-name.test.ts` | ✅ |
| Descrição na criação rápida, ⌘↵ dentro dela, "Criar outra" limpa, conferência no detalhe, axe nos dois temas com o campo aberto | `tests/e2e/tasks.spec.ts` | ✅ |
| Editar nome em Membros e em Minhas preferências, com axe | `tests/e2e/members.spec.ts` | ✅ |
| Vitest inteiro | `npx vitest run` | ✅ 117 em 23 arquivos |
| E2E inteiro no `next dev`, em paralelo | `npx playwright test` | ⚠️ 36 passaram, 7 falharam por carga (tasks, views, templates, mobile); os mesmos arquivos em série (`--workers=1`): ✅ 7 + 11. O resultado que vale é o do job `e2e` do CI (build de produção) |

## Commits

```
a18ec0a fix(docker): keep playwright config out of the build context
de78421 ci: add ssh deploy workflow
c9cf389 feat(migration): add windshift import
3f226be feat(tasks): add optional description to quick create
b1c86af feat(members): edit display name
```

O `a18ec0a` foi para a `main` antes do módulo, no PR #14 (`c57807b`). O ADR-056 entrou no
`c9cf389`, no mesmo commit do código que ele descreve.

## O que mudou no `glpi-srv` (para o guia do servidor, tarefa do Matheus)

- Pasta nova `/home/glpissh/docker/itc-tasks` (dono `github-deploy`), containers `itc-tasks`
  (`127.0.0.1:3021`), `itc-tasks-worker` e `itc-tasks-db`; volumes `itc-tasks_itc-tasks-uploads`
  e `itc-tasks_itc-tasks-db-data`.
- `~github-deploy/.ssh/`: `itc_tasks_deploy` (+ `.pub`), `config` novo, uma linha nova no
  `authorized_keys` (`github-actions itc-tasks`, com comando forçado).
- Túnel: `tasks.itcbr.xyz → localhost:3021`. Windshift sem rota pública; `tailscale serve` da 3020.
- Homepage: item "ITC Tasks" no grupo Sistemas.
- `/home/glpissh/windshift-export/` (exportação e `raw/windshift.db`, que contém hashes e
  sessões; não sai do servidor) e `/home/glpissh/.config/windshift-export/` (script e token).
- `.bak`: `authorized_keys.bak-20261018-1414`, `config.yml.bak-20261018-2046`,
  `services.yaml.bak-20261018-2047`. O `.env.bak-20261018-2026` foi apagado com `shred`.

## Ficou de fora

- **`apply` em produção:** só depois do merge, com o `--dry-run` revisado pelo Matheus.
- **Remoção do Windshift:** feita em 19/10/2026, depois do módulo (M-104/M-105). Registro em `docs/INFRA.md` §2.4 e §10, item 12.
- **Monitor no Uptime Kuma:** com o Matheus.
- **Revogar o token do Windshift** e **tirar o acesso do Claude Code** ao `glpi-srv`
  (`/etc/sudoers.d/claude-code-golive` e a linha `claude-code glpi-srv` do
  `~/.ssh/authorized_keys`): com o Matheus, no fim do módulo.
- **Contraste do `text-err` no escuro:** `#d75a4a` sobre o `bg-surface` `#1e2422` dá cerca de
  4,1:1. Afeta as mensagens de erro de todos os diálogos e aparece com o axe quando há erro na
  tela. O `members.spec` roda o axe antes do erro. Fica para decisão do Design System (M-088),
  junto do ponto do `text-muted`.

## Pontos de atenção

- **`docker compose up -d` não recria os containers quando só o `.env` muda.** Use
  `--force-recreate --no-deps itc-tasks itc-tasks-worker`. Valor com `#` ou `$` vai entre aspas
  simples, sem nada depois da aspa.
- **A opção `silent` é só da importação.** Passá-la em escrita do dia a dia esconde avisos e
  automações sem deixar rastro além do evento.
- **A API de token do Windshift é a `/rest/api/v1`.** A `/api/v2` é a de sessão e recusa
  Bearer. `custom_fields` dos itens vem às vezes pelo id do campo e às vezes pelo nome; o
  service procura pelos dois.
- **O `shell.spec.ts` procura o admin pelo nome "Administrador".** Os E2E de nome não renomeiam
  esse usuário.
