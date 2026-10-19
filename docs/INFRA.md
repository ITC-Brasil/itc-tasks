# ITC Tasks — Infraestrutura, servidor e deploy

> **Estado:** planejado (17/10/2026). Nada do ITC Tasks está no servidor ainda.
> Este documento reúne o que já existe no `glpi-srv` e como o ITC NoteScan é publicado lá,
> para que o ITC Tasks siga o mesmo padrão. Fontes: documentos do projeto *Infraestrutura - ITCBR*
> (`guia-servidor-glpi-srv.md` v2.0, `contexto-glpi-srv.md` v2.0, `licoes-aprendidas-glpi-srv.md`,
> `novo-container-glpi-srv.md`, todos de 16/07/2026) e do projeto *ITC NoteScan*
> (`ARCHITECTURE.md`, `documentacao-notescan.md`, `DECISIONS.md`, instruções do projeto).
> Credenciais **não** estão aqui: ficam em `credenciais-glpi-srv.md` / Vaultwarden.
>
> Decisões relacionadas: ADR-011 (substituída), ADR-026, ADR-027, ADR-028, ADR-029.

---

## 1. Resumo em uma tela

| Item | Valor |
|---|---|
| Servidor | `glpi-srv` — Dell PowerEdge R250 (Xeon E-2324G, 16 GB RAM, 2× SSD 480 GB RAID) |
| SO / Docker | Ubuntu 24.04.4 LTS / Docker 29.8.1, Compose 5.5.1, cloudflared 2026.6.0 (conferido em 17/10/2026) |
| Pasta do app | `/home/glpissh/docker/itc-tasks` (padrão `~/docker/<nome>`), **dona `github-deploy`** como a do NoteScan |
| Containers | `itc-tasks`, `itc-tasks-worker`, `itc-tasks-db` |
| Porta no host | `127.0.0.1:3021` → container `3000` (confirmada livre em 17/10/2026) |
| Publicação | Túnel `itcbr-tunnel` (cloudflared no host) → `https://tasks.itcbr.xyz` |
| Deploy | Merge na `main` → GitHub Actions → SSH como `github-deploy` → `scripts/deploy.sh` |
| Registry de imagens | Nenhum — build no próprio servidor (ADR-027) |
| Banco | PostgreSQL 18.6 exclusivo, sem porta no host |
| Monitoramento | Uptime Kuma (`monitor.itcbr.xyz`), Homepage (`dash.itcbr.xyz`), Grafana/cAdvisor |

---

## 2. O servidor `glpi-srv`

### 2.1 Rede

O R250 tem duas interfaces independentes. O ITC Tasks usa só a `eno8403`.

| Interface | Endereço | Ligada a | Serve |
|---|---|---|---|
| `eno8303` | `192.168.88.224/24` (DHCP reservado) | MikroTik RB1100 — Vivo, IP fixo | GLPI, RustDesk, SSH externo (porta 2222) — **nunca alterar** |
| `eno8403` | `10.10.10.10/24` | MikroTik RB750r2 — Claro 1 Gbps (failover link Estádio) | Serviços Docker via Cloudflare Tunnel |

```
Internet
  ├─ Vivo (IP fixo) → RB1100 (192.168.88.1) → eno8303 → GLPI :8888, RustDesk, SSH :2222→22
  └─ Claro (1 Gbps) → RB750r2 (10.10.10.1) → eno8403 (10.10.10.10) → cloudflared → *.itcbr.xyz
```

**Consequência para o ITC Tasks:** se a `eno8403` cair, `tasks.itcbr.xyz` fica fora do ar
(como todos os `*.itcbr.xyz`). GLPI e RustDesk continuam funcionando. Netplan só se altera com
acesso físico ou pelo iDRAC.

### 2.2 Acesso

| Acesso | Host | Porta | Uso |
|---|---|---|---|
| SSH externo | `glpi.grupoitcbrasil.com.br` | `2222` | Port forward no RB1100 → 22. É por aqui que o GitHub Actions entra |
| SSH via Tailscale | `100.68.161.44` | `22` | Acesso do time (tailnet ITC). **Não** usar 2222 pela Tailscale |
| iDRAC | `192.168.88.225` | — | Console de emergência |

### 2.3 Usuários

| Usuário | Papel |
|---|---|
| `glpissh` | Usuário de SSH e dono de `~/docker/` — onde ficam todos os containers |
| `glpi` | Dono dos processos GLPI e RustDesk; sem SSH |
| `github-deploy` | Usado pelo GitHub Actions (2 chaves ed25519 em `authorized_keys`); grupos `github-deploy` e `docker`; **sem sudo**. É o dono das pastas de projetos com deploy automático (`notescan`; `sentinel` também está no `safe.directory` dele) |

### 2.4 O que já roda e não pode ser afetado

- **GLPI** e **RustDesk**: 600+ notebooks e todos os clientes apontam para eles. Não mexer. Em 17/10/2026 o GLPI aparece como container (`glpi` em `192.168.88.224:80` e `0.0.0.0:8889`, mais `glpi-db`) — o guia do servidor ainda o descreve fora do Docker; o endereço `http://glpi.grupoitcbrasil.com.br:8888` continua o mesmo (port forward do RB1100). Backup do GLPI: `/usr/local/bin/glpi-backup`, crontab do root às 05:00.
- **Ollama** no host (porta 11434), Watchtower, Uptime Kuma, Grafana + Prometheus + Node Exporter + cAdvisor, Homepage, n8n, Vaultwarden, ITC NoteScan e outros em `~/docker/`.
- **Windshift:** o sistema que o ITC Tasks substituiu. **Removido em 19/10/2026** (M-104/M-105): container, imagens, volume `windshift_windshift-data`, pasta `~/docker/windshift`, `tailscale serve` da 3020 e o cliente OIDC `windshift` do Authelia. A porta 3020 está livre. O único registro guardado é o histórico em CSV (§10, item 12).

> O guia do servidor está desatualizado em relação ao `ls ~/docker` de 17/10/2026, que já mostra
> `authelia`, `beszel`, `dozzle`, `mcp-brasil`, `nocodb`, `outline`, `routemap`, `scriberr`,
> `sentinel`, `smartnx-proxy`, `stirling-pdf`, `tecnico-assistente`, `waha`, `wikijs` e `windshift`.
> Por isso **portas e nomes sempre se conferem no próprio host**, nunca só pelo guia.

---

## 3. Padrões do servidor que o ITC Tasks segue

Baseados em `novo-container-glpi-srv.md`:

| Padrão | No ITC Tasks |
|---|---|
| Pasta `~/docker/<nome>/` | `/home/glpissh/docker/itc-tasks` |
| `container_name` explícito | `itc-tasks`, `itc-tasks-worker`, `itc-tasks-db` |
| `restart: always` | Nos três |
| `TZ=America/Sao_Paulo` | Nos três (e `APP_TIMEZONE` no app) |
| Banco próprio por stack (como `n8n-db`, `evogo-db`, `notescan-db`) | `itc-tasks-db`, sem porta no host |
| Label do Watchtower | **Não usar** (exceção deliberada): `itc-tasks` e `itc-tasks-worker` são construídos localmente — não há imagem para puxar; o Postgres é atualizado à mão para evitar troca de versão sem controle |
| Porta conferida antes de usar | `sudo ss -tlnp \| grep :3021` |
| Porta no UFW | **Não precisa**: o app escuta só em `127.0.0.1`, e o túnel acessa por `localhost` |
| Portas só em `127.0.0.1` | **Obrigatório no ITC Tasks.** Portas publicadas pelo Docker em `0.0.0.0` passam por fora do UFW (o Docker cria regras próprias no iptables), então ficam acessíveis nas redes do RB1100 e do RB750r2 mesmo sem regra no UFW. Hoje vários containers estão assim, inclusive o `notescan-db` em `0.0.0.0:5433`. `routemap-app`, `tecnico-api` e `windshift` já usam `127.0.0.1` |
| Monitor no Uptime Kuma | HTTP(s) em `https://tasks.itcbr.xyz/api/health` |
| Registro na documentação do servidor | Guia (nova seção 3.x), contexto (serviços, portas, contador) e credenciais |
| Senhas | Únicas, só no `.env` da pasta, nunca no `docker-compose.yml` nem no repositório |
| Volume do Postgres | Postgres 18 ou maior: montar o volume em `/var/lib/postgresql`, não em `/var/lib/postgresql/data` |

---

## 4. Publicação pelo Cloudflare Tunnel

O `cloudflared` roda **no host** como serviço systemd, com o túnel `itcbr-tunnel`. Não existe
container de túnel no ITC Tasks (ADR-028).

| Arquivo | Uso |
|---|---|
| `~/.cloudflared/config.yml` | Arquivo que se edita |
| `/etc/cloudflared/config.yml` | Arquivo que o serviço lê — sempre copiar depois de editar |

### Passo a passo

A rota `tasks.itcbr.xyz` já existia (era do Windshift, em `localhost:3020`); não houve `cloudflared tunnel route dns`. Na virada de 18/10/2026 só o `service` mudou:

```bash
# 1. Cópia antes de editar
cp -p ~/.cloudflared/config.yml ~/.cloudflared/config.yml.bak-$(date +%Y%m%d-%H%M)

# 2. Na entrada existente, trocar só o service (comentário sem acento)
#   # ITC Tasks (tarefas da TI)
#   - hostname: tasks.itcbr.xyz
#     service: http://localhost:3021

# 3. Aplicar (derruba *.itcbr.xyz por alguns segundos; GLPI e RustDesk não passam pelo túnel)
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
curl -fsS https://tasks.itcbr.xyz/api/health
```

### Cuidados (lições do servidor)

- **Nunca** instalar ou reinstalar o cloudflared com `service install TOKEN`: esse modo ignora o `config.yml` (lição 6).
- O cloudflared foi instalado por `.deb` do GitHub (o APT da Cloudflare falha no Ubuntu 24.04); **não atualiza com `apt upgrade`** (lição 1).
- O locale precisa ser `pt_BR.UTF-8`: com POSIX, acentos no `config.yml` corrompem o arquivo (`invalid trailing UTF-8 octet`) (lição 5). Preferir comentários sem acento.
- **Limites do túnel que moldam o app:** ~100 s de timeout por requisição, uploads até 100 MB (o Pingvin Share usa chunks de 90 MB pelo mesmo motivo), conexões ociosas podem cair. No ITC Tasks: jobs fora da requisição, anexos ≤ 25 MB, SSE com heartbeat de 25 s.
- **IP do cliente:** o app só vê o IP do túnel no socket. `src/server/auth.ts` lê `cf-connecting-ip` e depois `x-forwarded-for` (`advanced.ipAddress.ipAddressHeaders`), para o rate limit do Better Auth não juntar todo mundo numa chave só. Esse rate limit liga só com `NODE_ENV=production` (definido no `Dockerfile`) e guarda os contadores em memória: reiniciar o container zera, o que é aceitável com uma réplica.
- `/mcp` precisa ser acessível por agentes sem login no navegador. Se um dia o subdomínio ficar atrás de Cloudflare Access (há uma avaliação pendente para o Homepage), liberar `/mcp` com service token ou regra de bypass.

---

## 5. Como o ITC NoteScan é publicado (referência)

| Item | NoteScan |
|---|---|
| Pasta | `/home/glpissh/docker/notescan` |
| Containers | `notescan-app` (Next.js standalone, porta 3010) e `notescan-db` (PostgreSQL 16, rede interna `notescan_default`) |
| Túnel | `notescan.itcbr.xyz` → `http://localhost:3010` |
| Branches | `feat/…` → `develop` → PR → `main` (protegida, 1 aprovação, push direto bloqueado). No ITC Tasks a proteção é por disciplina e hook local (ADR-034) |
| CI | "Quality Check": `npm ci`, `prisma generate`, type-check, lint (com `eslint-plugin-security`), `prisma migrate deploy` no Postgres de serviço, testes com cobertura, `npm audit --audit-level=high` |
| Segurança no GitHub | Dependabot (minor/patch, máx. 5 PRs), Secret Scanning. **CodeQL removido**: o GitHub Advanced Security não está disponível no plano gratuito para repositório privado da org ITC-Brasil |
| CD | Merge na `main` → `deploy.yml` com `appleboy/ssh-action@v1` (por tag, não SHA), `port: 2222` fixo, `command_timeout: 20m`; script: `cd /home/glpissh/docker/notescan && git pull origin main && docker compose up -d --build && docker image prune -f`. Sem health check depois do deploy |
| Secrets do CD | `DEPLOY_HOST` (sem porta), `DEPLOY_PORT` (`2222`), `DEPLOY_USER` (`github-deploy`), `DEPLOY_SSH_KEY` |
| Migrações | `scripts/docker-entrypoint.sh` roda as migrações antes de iniciar o Next |
| Deploy manual | A pasta é do `github-deploy` (`755`), então o `git pull` precisa rodar como ele: `sudo -u github-deploy git -C ~/docker/notescan pull origin main` e depois `docker compose up -d --build` |
| Porta | `notescan-app` em `0.0.0.0:3010` e `notescan-db` em `0.0.0.0:5433`, ambos publicados para fora |
| Nginx | **Não há.** O Next standalone escuta direto na 3000 do container (`EXPOSE 3000`, `CMD ["./docker-entrypoint.sh"]`, imagem `node:20-alpine`). A menção a "Docker + Nginx" nos documentos do NoteScan está desatualizada |
| Autenticação do servidor no GitHub | `git remote` em HTTPS com token embutido na URL (fica em `.git/config`, legível por outros usuários do servidor) |

### Lições do NoteScan que valem para o ITC Tasks

| Problema no NoteScan | Causa | O que fazemos no ITC Tasks |
|---|---|---|
| `sh: prisma: not found` no container | O output standalone não copia os links de `node_modules/.bin` | Migrações chamadas por `node` direto (migrator do `drizzle-orm` compilado em `dist/migrate.js`), sem depender de `.bin` |
| `Cannot find module 'effect'` | Dependência transitiva não incluída pelo standalone | Testar o container do zero no Módulo 00; se faltar módulo, copiar só o necessário e registrar em ADR |
| `datasource.url property is required` | Arquivo de config do ORM fora do estágio final da imagem | Conferir que tudo o que o entrypoint lê está no estágio `runner` do Dockerfile |
| `UntrustedHost` no Auth.js em produção | Host de produção não declarado como confiável | `BETTER_AUTH_URL=https://tasks.itcbr.xyz` e `trustedOrigins` no Better Auth desde o Módulo 01 |
| `git pull: Permission denied` | Dono da pasta e usuário que faz o `pull` diferentes | Mesmo modelo que o NoteScan usa hoje: pasta criada e mantida pelo `github-deploy`; manutenção manual com `sudo -u github-deploy`. Não alternar o dono entre `glpissh` e `github-deploy` |
| Token do GitHub legível no servidor | Remote HTTPS com token na URL | Deploy key **só-leitura** do repositório `itc-tasks`, na `~/.ssh` do `github-deploy` (modo 600); remote `git@github.com:ITC-Brasil/itc-tasks.git` |
| Build frio estoura o tempo do Actions | `ssh-action` tem padrão de 10 min | Timeout do passo de 20 min, como no NoteScan |
| Banco exposto | `notescan-db` publicado em `0.0.0.0:5433` | `itc-tasks-db` sem `ports:` |
| CD ficou pendente por um tempo | Porta 2222 não estava configurada | Porta 2222 desde o primeiro workflow (o NoteScan hoje a fixa no YAML; no ITC Tasks fica no secret `DEPLOY_PORT`) |
| Postgres locais em conflito no Windows | Dois projetos na mesma porta do host | Dev do ITC Tasks em `5435` (NoteScan usa `5434`) |

---

## 6. ITC Tasks em produção

### 6.1 Estrutura da pasta

```
/home/glpissh/docker/itc-tasks/      ← clone de git@github-itc-tasks:ITC-Brasil/itc-tasks.git (main), dono github-deploy, 755
├── docker-compose.yml               ← versionado
├── .env                             ← NÃO versionado; dono github-deploy, modo 600
├── Dockerfile
├── scripts/deploy.sh
├── scripts/docker-entrypoint.sh
└── ...
```

**Clone por alias SSH.** O `github-deploy` clona por `git@github-itc-tasks:…`, um `Host` do `~github-deploy/.ssh/config` (600) que aponta para `github.com` com a deploy key **só-leitura e exclusiva** do repositório (`~github-deploy/.ssh/itc_tasks_deploy`, `IdentitiesOnly yes`). Os outros projetos do `github-deploy` usam remote HTTPS e não dependem desse `config`.

### 6.2 `docker-compose.yml` (rascunho para o Módulo 00)

```yaml
services:
  itc-tasks:
    build: .
    image: itc-tasks:local
    container_name: itc-tasks
    restart: always
    ports:
      - 127.0.0.1:3021:3000
    env_file: .env
    environment:
      - TZ=America/Sao_Paulo
    volumes:
      - itc-tasks-uploads:/data/uploads
    depends_on:
      itc-tasks-db:
        condition: service_healthy

  itc-tasks-worker:
    image: itc-tasks:local
    container_name: itc-tasks-worker
    restart: always
    command: ["node", "dist/worker.mjs"]
    env_file: .env
    environment:
      - TZ=America/Sao_Paulo
    volumes:
      - itc-tasks-uploads:/data/uploads
    depends_on:
      itc-tasks-db:
        condition: service_healthy

  itc-tasks-db:
    image: postgres:18.6-alpine
    container_name: itc-tasks-db
    restart: always
    environment:
      - TZ=America/Sao_Paulo
      - POSTGRES_DB=itc_tasks
      - POSTGRES_USER=itc_tasks
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - itc-tasks-db-data:/var/lib/postgresql   # Postgres 18: PGDATA em /var/lib/postgresql/18/docker
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U itc_tasks -d itc_tasks"]
      interval: 10s
      retries: 5

volumes:
  itc-tasks-uploads:
  itc-tasks-db-data:
```

Sem label do Watchtower (§3). Sem porta do Postgres no host. Versão implementada: `docker-compose.yml` na raiz do repositório (Módulo 00), com o `itc-tasks-worker` sempre ativo desde o Módulo 08 (`node dist/worker.mjs`, ADR-050).

### 6.3 `.env` de produção (nomes; valores no Vaultwarden)

```
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://itc_tasks:<senha>@itc-tasks-db:5432/itc_tasks
BETTER_AUTH_SECRET=                 # openssl rand -base64 32
BETTER_AUTH_URL=https://tasks.itcbr.xyz
GLPI_BASE_URL=http://glpi.grupoitcbrasil.com.br:8888
SMTP_HOST=smtp.titan.email
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tasks@itcbr.xyz
SMTP_PASSWORD=                      # senha de aplicativo do Titan se houver 2FA
MAIL_FROM="ITC Tasks <tasks@itcbr.xyz>"
VAPID_PUBLIC_KEY=                   # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tasks@itcbr.xyz
UPLOADS_DIR=/data/uploads
APP_TIMEZONE=America/Sao_Paulo
```

Trocar as chaves VAPID depois do go-live invalida todas as assinaturas de push (mesmo aviso do NoteScan).

Cuidados com o `.env` (aprendidos no go-live):

- Valor com `#`, `$` ou espaço vai entre **aspas simples**, sem nada depois da aspa de fechamento (um espaço ali muda o valor lido pelo Compose).
- Mudar só o `.env` **não** recria os containers no `docker compose up -d`: use `sudo -u github-deploy docker compose up -d --force-recreate --no-deps itc-tasks itc-tasks-worker`.
- `SEED_ADMIN_*` não ficam no `.env`: passam só na hora do seed (§10).
- Teste do SMTP: o nodemailer vem empacotado no `dist/worker.mjs`, então o teste é um `AUTH PLAIN` com o `tls` do Node no container do worker, lendo o ambiente. A caixa do Titan precisa de "SMTP para serviços externos" habilitado.

---

## 7. Deploy

### 7.1 Fluxo

```
feat/… ──PR──▶ develop ──PR (CI verde + 1 aprovação; ADR-034)──▶ main
                                                         │
                                       GitHub Actions: deploy.yml
                                                         │  ssh -p 2222 github-deploy@glpi.grupoitcbrasil.com.br
                                                         ▼
                              /home/glpissh/docker/itc-tasks/scripts/deploy.sh
                              git pull --ff-only → docker compose up -d --build
                              → entrypoint aplica migrações → /api/health OK
```

### 7.2 `.github/workflows/deploy.yml`

Dispara em `push` na `main` e em `workflow_dispatch`; `concurrency: deploy-production` sem cancelar o que está rodando; `permissions: {}`; `timeout-minutes: 25` (build frio). Sem action de terceiros para SSH.

- **Host conferido:** o secret `DEPLOY_KNOWN_HOSTS` vira um `known_hosts`, e o `ssh` roda com `-o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes` (sem `accept-new`). A linha foi montada no servidor a partir de `/etc/ssh/ssh_host_ed25519_key.pub`, no formato `[glpi.grupoitcbrasil.com.br]:2222 ssh-ed25519 …`.
- **Chave exclusiva do ITC Tasks** (não a do NoteScan), gerada fora do `~github-deploy/.ssh`; a privada só existe no secret `DEPLOY_SSH_KEY`. No job, ela fica num arquivo 600, apagado no fim (`if: always()`).
- **Comando forçado:** no `~github-deploy/.ssh/authorized_keys`, a chave do Actions tem

  ```
  restrict,command="cd /home/glpissh/docker/itc-tasks && git pull --ff-only origin main && bash scripts/deploy.sh" ssh-ed25519 … github-actions itc-tasks
  ```

  A chave só faz o deploy; o comando enviado pelo `deploy.yml` é ignorado. O `git pull` antes do script cobre o caso de o `deploy.sh` mudar no próprio commit.

- **Secrets** em `ITC-Brasil/itc-tasks`: `DEPLOY_HOST=glpi.grupoitcbrasil.com.br`, `DEPLOY_PORT=2222` (o RB1100 redireciona para a 22), `DEPLOY_USER=github-deploy`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.

### 7.3 `scripts/deploy.sh`

Roda como `github-deploy` (LF, bit de execução no Git): `git pull --ff-only origin main`, `docker compose up -d --build`, espera `/api/health` em `127.0.0.1:3021` (30 × 5 s) e roda `docker image prune -f` só se der certo. Se falhar, mostra `docker compose logs --tail 50 itc-tasks itc-tasks-worker` e sai com erro.

O CI tem o job **Docker build** (`docker build` com o `.dockerignore`), que pega antes da `main` o que só quebra na imagem (caso do PR #14).

### 7.4 Migrações

`scripts/docker-entrypoint.sh` roda `node dist/migrate.mjs` (migrator do `drizzle-orm`) e só então
`node server.js`. Migrações já aplicadas nunca são editadas; mudança de schema é sempre migração nova.

### 7.5 Deploy manual e rollback

```bash
ssh glpissh@100.68.161.44                  # Tailscale (porta 22)
sudo -u github-deploy bash ~/docker/itc-tasks/scripts/deploy.sh   # deploy manual (mesmo script do CD)

# rollback: voltar a um commit anterior (sempre como github-deploy, dono da pasta)
sudo -u github-deploy git -C ~/docker/itc-tasks log --oneline -5
sudo -u github-deploy git -C ~/docker/itc-tasks checkout <hash>
cd ~/docker/itc-tasks && docker compose up -d --build
sudo -u github-deploy git -C ~/docker/itc-tasks checkout main   # depois de corrigir
```

Rollback de código **não** desfaz migração, e não há backup definido (§9): por isso as migrações
ficam só aditivas, compatíveis com a versão anterior do código.

---

## 8. Monitoramento e logs

| Ferramenta | O que configurar |
|---|---|
| Uptime Kuma (`monitor.itcbr.xyz`) | Monitor HTTP(s) em `https://tasks.itcbr.xyz/api/health` |
| Homepage (`dash.itcbr.xyz`) | Item no grupo "Sistemas" com `siteMonitor` |
| Grafana + cAdvisor | Os três containers aparecem automaticamente no dashboard 14282 |
| Logs | `docker logs itc-tasks --tail 50` / `-f`; o servidor também tem `~/docker/dozzle` |
| Alertas técnicos | ntfy, tópico `itc-infra` (opcional: avisar falha de deploy) |

---

## 9. Backup — não definido

**Decisão de 17/10/2026 (Matheus Nobre): o ITC Tasks entra em produção sem backup definido.**
O tema será retomado depois.

Contexto registrado para quando for retomado:

- O servidor tem um único volume (`/dev/sda2`, 438 GB, RAID por hardware de 2× SSD 480 GB, 194 GB
  livres em 17/10/2026) e nenhum destino externo (NFS, CIFS, rclone, restic ou borg) — nem para o GLPI.
- O que precisaria de backup: o banco (`itc-tasks-db`, volume `itc-tasks-db-data`) e os anexos
  (volume `itc-tasks-uploads`). O resto é reconstruível a partir do repositório.

**Consequências enquanto não houver backup:**

- Uma falha do disco/RAID ou um erro humano no volume perde tarefas, histórico e anexos.
- Migrações de banco devem ser **só aditivas** (criar tabela/coluna, nunca remover ou reescrever
  dados) — rollback de código não desfaz migração, e não há backup para restaurar.
- Antes de qualquer operação arriscada manual, um dump pontual:
  `docker exec itc-tasks-db pg_dump -U itc_tasks -Fc itc_tasks > ~/itc-tasks-$(date +%F).dump`.

---

## 10. Checklist da primeira implantação

1. Confirmar a porta: `sudo ss -tlnp | grep :3021` (vazio = livre).
2. Gerar a deploy key só-leitura para o `github-deploy`, com o alias `github-itc-tasks` (§6.1), e cadastrar no repositório; clonar como ele: `sudo -u github-deploy git clone git@github-itc-tasks:ITC-Brasil/itc-tasks.git /home/glpissh/docker/itc-tasks` (o `glpissh` tem sudo; a home dele é `755`, então o `github-deploy` atravessa até `~/docker`). Criar a pasta antes, se o clone não puder criá-la: `sudo install -d -o github-deploy -g github-deploy -m 755 /home/glpissh/docker/itc-tasks`.
3. Criar o `.env` (§6.3) como `github-deploy`, modo 600, com senhas novas; guardar no Vaultwarden.
4. Primeiro build: `sudo -u github-deploy bash -c "cd ~glpissh/docker/itc-tasks && docker compose up -d --build"` e `docker compose ps`.
5. Seed do primeiro admin, com as variáveis só na hora (fora do `.env` e do histórico): `read` de `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` e, opcional, `SEED_ADMIN_NAME`; depois `sudo -u github-deploy env SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" SEED_ADMIN_NAME="$SEED_ADMIN_NAME" docker compose exec -T -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD -e SEED_ADMIN_NAME itc-tasks node dist/seed.mjs`.
6. Troca do `service` da rota existente no túnel (§4) e teste em `https://tasks.itcbr.xyz`.
7. Secrets do GitHub (§7.2) e um deploy de teste por merge na `main`.
8. Monitor no Uptime Kuma e item no Homepage (§8).
9. Backup: não definido (§9) — nenhum passo nesta implantação.
10. Criar a caixa `tasks@itcbr.xyz` no Titan; conferir SPF/DKIM/DMARC do `itcbr.xyz`; enviar e-mail de teste.
11. Registrar no projeto *Infraestrutura - ITCBR*: guia (seção 3.x), contexto (serviço, porta 3021, contador) e credenciais.
12. Windshift: no go-live, a rota pública passou para o ITC Tasks, e ele ficou só na tailnet, sem login pelo navegador. As 15 tarefas abertas foram importadas em 19/10/2026 (`task_imports`) e o Windshift foi removido no mesmo dia (§2.4).
    - **Registro histórico:** `~/windshift-historico.csv` no `glpi-srv` (600, `glpissh`), com os 29 itens (abertos, concluídos, Epics e o item pessoal). Colunas: chave, id, tipo, título, status, prioridade, responsável, Projetos/Clientes, UMs, Epic, datas em Brasília, `chave_itc_tasks` (o `TI-<n>` novo) e descrição. UTF-8 com BOM, separador `;`. Há uma cópia em `data/windshift/` na pasta local do projeto, fora do Git.
    - A exportação completa (JSON e cópia do SQLite) e o token da API foram apagados com `shred`. Não há outra cópia dos dados do Windshift.

A primeira implantação foi em 18/10/2026; o registro está em `docs/modules/12-migracao-implantacao.md`.

---

## 11. A confirmar

| Item | Situação |
|---|---|
| Backup | Não definido por decisão de 17/10/2026 (§9); retomar depois |
| `main` sem proteção no GitHub (risco aceito) | O repositório está no plano Free: branch protection, rulesets e environment com revisor exigem GitHub Team. Decisão do Matheus (M-112, 19/10/2026): **não assinar**. Risco aceito: a `main` só é protegida pelo hook local (ADR-034) e pela disciplina dos admins, e qualquer push ou merge nela publica direto em produção pelo `deploy.yml`, que roda como `github-deploy` (grupo `docker`). Issue #21 fechada como *not planned*. Mitigações sem custo recomendadas: 2FA obrigatório na organização e lista de admins revista |
| Chave de assinatura OIDC (`jwks`) do Authelia | Em 19/10/2026, um fragmento do fim dessa chave privada apareceu na sessão do Claude Code, num `grep` com contexto do `configuration.yml` durante o levantamento do Windshift. A chave inteira não foi exposta e nada foi copiado para arquivo. Decisão do Matheus (M-104): **não rotacionar**. Se o histórico daquela sessão for compartilhado, rever a decisão |
| DMARC do `itcbr.xyz` | `p=none` (só monitora). SPF inclui o Titan e há DKIM no seletor `titan1`. Mantido por decisão de 18/10/2026; endurecer depois |
| Se outros projetos devem trocar o token do remote por deploy key | Sugestão; fora do escopo do ITC Tasks |
| Se os containers em `0.0.0.0` (ex.: `notescan-db:5433`) devem passar para `127.0.0.1` | Sugestão de segurança para o servidor; fora do escopo do ITC Tasks |
| Atualizar o guia do servidor | GLPI agora em container, cloudflared 2026.6.0, serviços e portas novos |

Resolvidos em 17/10/2026 (saídas de comandos no `glpi-srv`): mecanismo de deploy do NoteScan (pasta
dona `github-deploy`, sem sudo, grupo `docker`), ausência de Nginx, versões do Docker/Compose/cloudflared,
portas 3021/3022 livres, inexistência de destino externo de backup.
