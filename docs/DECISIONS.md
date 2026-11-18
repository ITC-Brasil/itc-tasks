# Architecture Decision Records

Sequential log of decisions with context and rejected alternatives.
Each entry is permanent — superseded ADRs are marked, never deleted.

> Todas as entradas abaixo são **pré-código** (escritas antes do Módulo 00), a partir das
> conversas de definição de 16–17/10/2026 com Matheus Silva.

---

## ADR-001 — Construir um app próprio em vez de configurar o Windshift

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
O Windshift foi instalado no servidor da ITC e funciona, mas o time de 4 pessoas não aderiu:
boards, portais, horas, gestão de testes e marcos aparecem ao mesmo tempo, e a configuração
exige conhecimento de cada módulo. O time precisa de três campos próprios (Projeto/Cliente,
Unidade Móvel, Chamado GLPI) e de operação por agentes via MCP.

**Decision**
Construir o ITC Tasks, um app enxuto focado no dia a dia do time de TI, com os campos ITC nativos e servidor MCP embutido.

**Alternatives considered**
- Configurar o Windshift desligando módulos — continua a carga de administração e não resolve o MCP nem os campos obrigatórios com validação própria.
- Plane / Linear / Jira — Linear e Jira são SaaS pagos e levam dados para fora; o Plane self-hosted é amplo demais para 4 pessoas e não tem os campos ITC.

**Consequences**
O time mantém o código. O escopo precisa ser defendido (lista "Fora" no `docs/PRD.md`) para o app não virar outro Windshift.

---

## ADR-002 — shadcn/ui sobre Base UI, não Radix

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
O shadcn/ui gera componentes no repositório e hoje oferece Base UI ou Radix como primitivos. Os outros projetos da ITC usam Base UI.

**Decision**
Usar `shadcn` 4.22.0 com `@base-ui/react` 1.9.0 como base de todos os componentes de interface.

**Alternatives considered**
- Radix — padrão histórico do shadcn, mas divergiria dos outros projetos ITC.
- Biblioteca fechada (MUI, Mantine) — impõe estética própria e dificulta seguir o Design System.

**Consequences**
Componentes que o shadcn ainda não tiver em Base UI serão escritos à mão sobre os primitivos. O componente Chart (Recharts) não depende de Radix e funciona igual.

---

## ADR-003 — Camada de serviço única para UI, MCP, automações e jobs

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Quatro origens escrevem dados: a interface, agentes via MCP, automações e jobs agendados. Se cada uma validar por conta própria, as regras (Projeto/Cliente obrigatório, cadastro arquivado, permissões) divergem.

**Decision**
Toda escrita passa por funções em `src/server/services/*`, que recebem um `Actor` (`user` | `agent` | `automation` | `system`) e são as únicas que tocam o banco para escrita.

**Alternatives considered**
- Lógica nas Server Actions e uma API REST separada para o MCP — duplicação de regras.
- Triggers no banco — difíceis de testar e invisíveis para quem lê o código TypeScript.

**Consequences**
Server Actions e ferramentas MCP ficam finas (validar input → chamar service → mapear erro). Todo service grava `task_events` com o `Actor`. Testes de integração miram os services.

---

## ADR-004 — Drizzle ORM em vez de Prisma

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O app usa PostgreSQL com tsvector, colunas geradas e o schema do pg-boss no mesmo banco. A imagem Docker deve ser enxuta.

**Decision**
Usar `drizzle-orm` 0.45.4 e `drizzle-kit` 0.31.11, com schema em TypeScript em `src/db/schema/`.

**Alternatives considered**
- Prisma 7 — removeu o motor Rust e diminuiu a distância, mas mantém etapa de geração de cliente e modela pior colunas geradas e tsvector. Seria a escolha se o time já dominasse Prisma em outros projetos.
- SQL puro (`pg`) — perde tipagem e migrações versionadas.

**Consequences**
Consultas próximas do SQL; tipos fluem para Zod via `drizzle-zod`. Busca full-text escrita com `sql` do Drizzle.

---

## ADR-005 — Driver `pg` compartilhado por Drizzle e pg-boss

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O pg-boss depende de `pg`. O Drizzle aceita `pg` ou `postgres` (postgres.js).

**Decision**
Usar `pg` 8.23.1 nos dois, com pools separados por processo (`app` e `worker`).

**Alternatives considered**
- `postgres` 3.4.9 para o Drizzle — dois drivers, duas configurações de TLS e pool para o mesmo banco.

**Consequences**
Uma única forma de configurar conexão (`DATABASE_URL`). Limitar o tamanho dos pools para não estourar `max_connections` do Postgres.

---

## ADR-006 — Zod como fonte única de validação

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O mesmo dado chega por formulário, Server Action e ferramenta MCP. O SDK do MCP define `inputSchema` em Zod.

**Decision**
Schemas Zod 4.6.7 em `src/lib/validation/` usados pelo `react-hook-form`, pelos services e pelas ferramentas MCP; variáveis de ambiente validadas por `@t3-oss/env-nextjs`.

**Alternatives considered**
- Valibot — menor, mas o SDK MCP e o `@hookform/resolvers` têm caminho principal em Zod.

**Consequences**
Uma mudança de regra (ex.: `glpiTicket` positivo de até 7 dígitos) vale na tela e no MCP ao mesmo tempo.

---

## ADR-007 — Better Auth em vez de Auth.js/NextAuth

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Precisamos de login por e-mail e senha, sem cadastro público, papéis e tokens de API para agentes. Em setembro de 2025 o Auth.js passou a ser mantido pelo time do Better Auth, que recomenda Better Auth para projetos novos; o Auth.js segue com correções de segurança.

**Decision**
Usar `better-auth` 1.7.10 com os plugins `admin` (papéis, criação de usuários) e `apiKey` (tokens MCP).

**Alternatives considered**
- Auth.js — forte em OAuth, fraco em credenciais e sem API keys nativas; agora em modo manutenção.
- Clerk — SaaS, dados fora do servidor da ITC.

**Consequences**
Sessões e tokens no próprio Postgres. Login com Google Workspace pode ser ligado depois sem trocar de biblioteca.

---

## ADR-008 — Argon2id para hash de senha

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
O Better Auth usa scrypt por padrão. A recomendação atual da OWASP coloca o Argon2id em primeiro lugar.

**Decision**
Substituir `emailAndPassword.password.hash/verify` por `@node-rs/argon2` 2.2.2 com Argon2id (parâmetros iniciais: `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1` — mínimo OWASP).

**Alternatives considered**
- scrypt padrão — seguro, mas fora do padrão desejado pela ITC.
- bcrypt — limite de 72 bytes e mais fraco contra GPU.

**Consequences**
Binário nativo: a imagem `node:24-alpine` precisa do pacote pré-compilado para musl (fornecido pelo `@node-rs`). Verificar no Módulo 01.

---

## ADR-009 — Servidor MCP embutido no app, em `/mcp`

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Agentes devem criar, atualizar e concluir tarefas com as mesmas regras da tela.

**Decision**
Rota `src/app/mcp/route.ts` com `@modelcontextprotocol/sdk` 1.32.1, transporte Streamable HTTP, autenticação por API key do Better Auth (`Authorization: Bearer`), ferramentas chamando os services (ADR-003). Limite inicial: 60 requisições/min por token.

**Alternatives considered**
- Serviço MCP separado chamando uma API REST — mais um processo e regras duplicadas.
- Só API REST — exigiria que cada agente tivesse um adaptador próprio.

**Consequences**
O contrato das ferramentas é tratado como API pública (`docs/API.md`), versionado e com testes. Se houver Cloudflare Access na frente, `/mcp` precisa de service token ou bypass.

---

## ADR-010 — pg-boss para jobs, sem Redis

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Automações, envio de notificações, lembretes de prazo (08:00) e virada de "vencida" precisam rodar fora da requisição.

**Decision**
Usar `pg-boss` 12.38.0 no mesmo Postgres, num processo `worker` separado (mesma imagem, comando `node worker/index.js`).

**Alternatives considered**
- BullMQ + Redis — mais um serviço para operar.
- Cron no container — sem retentativa nem histórico.

**Consequences**
Jobs com retentativa e agendamento sem infraestrutura nova. O `app` só publica jobs; o `worker` executa.

---

## ADR-011 — Deploy no servidor da ITC via Docker Compose e Cloudflare Tunnel

**Status:** Superseded by ADR-028
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
A ITC já hospeda serviços no próprio servidor com Cloudflare Tunnel. Dados não devem sair da infraestrutura do Grupo.

**Decision**
Quatro serviços no Compose (`app`, `worker`, `db`, `tunnel`), nenhuma porta publicada no host; `cloudflared` com `TUNNEL_TOKEN`.

**Alternatives considered**
- Vercel/Fly — dados fora da ITC, custo recorrente.
- Caddy com porta 443 aberta — superfície de ataque maior.

**Consequences**
Limites do túnel (timeout ~100 s, upload 100 MB) entram na arquitetura (`docs/ARCHITECTURE.md`): uploads limitados a 25 MB, SSE com heartbeat de 25 s.

---

## ADR-012 — lucide-react como conjunto de ícones

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O Sentinel não define ícones; as telas foram desenhadas em traço de 1,75 px arredondado.

**Decision**
Usar `lucide-react` 1.58.0 com `strokeWidth={1.75}` e tamanho 16 px; ícones de status (círculos) e prioridade (barras) são componentes próprios do Design System.

**Alternatives considered**
- Phosphor / Tabler — bons, mas fora do padrão do shadcn.

**Consequences**
Mapa fixo de ícones de domínio em `src/components/icons.ts` (pasta = Projeto/Cliente, `Truck` = UM, `Ticket` = GLPI etc.).

---

## ADR-013 — Tema apenas claro e escuro, sem "sistema"

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Matheus decidiu que o modo "seguir o sistema" não é necessário.

**Decision**
`next-themes` 0.4.6 com `themes={['light','dark']}`, `enableSystem={false}`, `defaultTheme="light"`, `attribute="data-theme"`; a escolha é salva em `user.theme` e aplicada no servidor para evitar flash.

**Alternatives considered**
- Incluir "sistema" — descartado pelo dono do produto.

**Consequences**
A meta `theme-color` muda junto (`#F5F0E8` / `#141918`). Os SVGs `-auto` da marca seguem o SO; dentro do app use as versões `principal`/`escuro` trocadas por `data-theme`.

---

## ADR-014 — `@dnd-kit/react` para arrastar e soltar

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O requisito é usar as versões mais recentes. `@dnd-kit/core` 6.3.1 e `@dnd-kit/sortable` 10.0.0 não são publicados desde dez/2024; o pacote ativo é `@dnd-kit/react` 0.5.1 (nova API, ainda 0.x).

**Decision**
Usar `@dnd-kit/react` 0.5.1 no Kanban, com ordenação por `tasks.position` (índice fracionário em texto).

**Alternatives considered**
- `@dnd-kit/core` 6.3.1 — estável, mas parado.
- `pragmatic-drag-and-drop` (Atlassian) — bom, mas menos integrado a React.

**Consequences**
API pode mudar antes da 1.0: isolar o uso em `src/components/board/` para trocar sem espalhar.

---

## ADR-015 — Gráficos com o componente Chart do shadcn (Recharts)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O Painel tem três gráficos simples (barras por semana, barra empilhada por status, barras por UM).

**Decision**
Usar `recharts` 3.10.1 via componente Chart do shadcn, lendo as cores dos tokens; barras de progresso em CSS puro.

**Alternatives considered**
- ECharts — reservado para um painel analítico futuro (zoom, milhares de pontos).
- visx — mais trabalho para o mesmo resultado.

**Consequences**
Gráficos trocam de tema automaticamente.

---

## ADR-016 — Serwist para o service worker do PWA

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O app precisa ser instalável, abrir sem internet (shell) e receber push. O Next 16 usa Turbopack.

**Decision**
Manifest em `src/app/manifest.ts`; service worker em `src/app/sw.ts` com `serwist` / `@serwist/turbopack` 9.5.13 (ou `@serwist/next` se o build usar webpack).

**Alternatives considered**
- `next-pwa` — sem manutenção.
- Service worker manual em `public/sw.js` — fallback se o Serwist falhar no build do Next 16.4.

**Consequences**
Escopo offline do MVP: shell e última lista vista em cache, sem edição offline.

---

## ADR-017 — Notificações em três canais: no app, Web Push e e-mail

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O time quer avisos no desktop e no celular sem app nativo.

**Decision**
Central no app (tempo real por SSE), Web Push com VAPID (`web-push` 3.6.7) e e-mail por SMTP (`nodemailer` 10.1.2, resumo diário). Preferências evento × canal por usuário; silêncio de push fora do expediente; ações do próprio usuário não notificam.

**Alternatives considered**
- Firebase Cloud Messaging — dependência externa desnecessária para Web Push.
- Só e-mail — não atende o uso no celular.

**Consequences**
No iPhone, push exige o PWA instalado na tela inicial (iOS 16.4+). Envio sempre via job do pg-boss.

---

## ADR-018 — Cadastros são arquivados, nunca excluídos

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Excluir um Projeto/Cliente ou UM apagaria ou quebraria o histórico de tarefas.

**Decision**
`projects`, `mobile_units`, `workflow_statuses` e `labels` têm `archivedAt`; arquivados somem dos seletores e do MCP (`list_*`), mas continuam visíveis nas tarefas antigas.

**Alternatives considered**
- Exclusão em cascata — perda de histórico.
- Soft delete genérico em todas as tabelas — complexidade sem ganho.

**Consequences**
Services recusam criar/editar tarefa apontando para cadastro arquivado (erro `ARCHIVED_REFERENCE`).

---

## ADR-019 — "Subtarefas" são itens de checklist, não tarefas filhas

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
As telas mostram subtarefas como lista marcável com responsável opcional e progresso (2/5). Tarefas filhas completas trariam status, prazo, campos ITC e hierarquia — o que o PRD lista como complexidade a evitar.

**Decision**
Tabela `checklist_items` (texto, feito, posição, responsável opcional), exibida como "Subtarefas".

**Alternatives considered**
- `tasks.parent_id` com tarefas completas — hierarquia de tipos que o produto quer evitar.

**Consequences**
Algo grande o bastante para ter prazo próprio vira outra tarefa com vínculo `relates`/`blocks`.

---

## ADR-020 — Tempo real por Server-Sent Events

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Notificações e mudanças no board feitas por outras pessoas ou agentes devem aparecer sem recarregar.

**Decision**
Rota `src/app/api/events/route.ts` com SSE alimentada por `LISTEN/NOTIFY` do Postgres; o cliente invalida queries do TanStack Query ao receber eventos. Heartbeat a cada 25 s por causa do túnel.

**Alternatives considered**
- WebSocket — exige servidor custom fora do Next.
- Polling — simples, mas atrasado e com carga desnecessária.

**Consequences**
Com 4 usuários, uma conexão SSE por aba é irrelevante para o servidor.

---

## ADR-021 — Identificador visível `TI-<número>`

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Os IDs aparecem em cards, busca, comentários e falas do time ("vê a TI-142").

**Decision**
`tasks.number` inteiro sequencial (sequence do Postgres), exibido com prefixo fixo `TI-`; UUID como chave primária interna.

**Alternatives considered**
- Prefixo por Projeto/Cliente (`TRL-12`) — muda se a tarefa trocar de projeto.

**Consequences**
URLs usam o número: `/tarefas/142`. O MCP aceita `TI-142` ou `142`.

---

## ADR-022 — Categorias de status fixas

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Times querem nomear status livremente, mas relatórios, ícones e automações precisam de semântica estável.

**Decision**
Cada status pertence a uma de quatro categorias fixas: `backlog`, `todo`, `in_progress`, `done`. Ícone, cor e regras ("concluída") vêm da categoria.

**Alternatives considered**
- Status totalmente livres — painel e automações quebram a cada renomeação.

**Consequences**
`completedAt` é preenchido ao entrar em status `done` e limpo ao sair.

---

## ADR-023 — GLPI apenas referenciado, sem integração no MVP

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
Chamados e solicitações continuam no GLPI. O ITC Tasks precisa só apontar para o chamado.

**Decision**
`tasks.glpiTicket` (inteiro) e link montado com `GLPI_BASE_URL` (`<base>/front/ticket.form.php?id=<n>`). Sem chamadas à API do GLPI. Base em produção: `http://glpi.grupoitcbrasil.com.br:8888` (informada em 17/10/2026).

**Alternatives considered**
- Validar/sincronizar via API REST do GLPI — útil, mas fora do MVP.

**Consequences**
Número inválido não é detectado no MVP. Integração pode entrar depois sem mudar o schema.

---

## ADR-024 — Um único time, sem workspaces

**Status:** Accepted
**Date:** 2026-10-16
**Module:** Pre-implementation

**Context**
O app atende só o time de TI (4 pessoas).

**Decision**
Não modelar workspaces/organizações; todas as tabelas são do único time.

**Alternatives considered**
- Multi-tenant desde o início — custo em toda consulta sem uso previsto.

**Consequences**
Se outra área quiser usar, será outra instalação ou uma migração que adiciona `team_id`.

---

## ADR-025 — Anexos em volume local

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Anexos são poucos e pequenos (prints, configs). Não há object storage na ITC.

**Decision**
Arquivos em `/data/uploads/<uuid>` (volume `uploads`), metadados em `attachments`, download por rota autenticada. Limite de 25 MB.

**Alternatives considered**
- S3/R2 — dados fora da ITC e mais uma credencial.
- `bytea` no Postgres — infla o banco e o backup.

**Consequences**
O backup precisa incluir o volume `uploads` além do `pg_dump`.

---

## ADR-026 — E-mail transacional pelo Titan Mail do domínio itcbr.xyz

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O ITC Tasks envia notificações e o resumo diário por e-mail. O domínio do app é `itcbr.xyz`, cujo e-mail já está no Titan Mail.

**Decision**
Enviar por SMTP do Titan (`smtp.titan.email`, porta 465 com SSL; 587 com STARTTLS como alternativa) a partir de uma caixa dedicada `tasks@itcbr.xyz`, com `nodemailer` 10.1.2, sempre por job do pg-boss.

**Alternatives considered**
- Serviço transacional (Resend, Amazon SES, Postmark) — melhor entrega e métricas, mas mais um fornecedor e mais um domínio para configurar.
- SMTP do domínio `grupoitcbrasil.com.br` — mistura o app com o e-mail institucional.

**Consequences**
É preciso criar a caixa `tasks@itcbr.xyz`, ativar o acesso de apps de terceiros no Titan e usar senha de aplicativo se houver 2FA. SPF, DKIM e DMARC do `itcbr.xyz` precisam estar configurados para os avisos não caírem em spam. O Titan não documenta limite de envio para scripts: o volume de 4 usuários é baixo, mas, se houver bloqueio, trocar por um serviço transacional com novo ADR.

---

## ADR-027 — Sem registry de imagens: build e deploy no servidor da ITC

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
A versão anterior do plano publicava a imagem no GitHub Container Registry (`ghcr.io`). O armazenamento do ghcr.io hoje é gratuito, mas a documentação do GitHub diz "currently free" e prevê aviso de um mês antes de cobrar; pacotes privados de outros tipos já têm cota (500 MB / 1 GB de transferência no plano Free). A ITC nunca usou o ghcr.io e decidiu não depender de serviço com possibilidade de custo.

**Decision**
Não usar registry. O servidor da ITC clona o repositório e constrói a imagem localmente com `docker compose up -d --build` a partir de uma tag `v*`, pelo script `scripts/deploy.sh`.

**Alternatives considered**
- ghcr.io — gratuito hoje, mas sem garantia; descartado pelo dono do produto.
- Docker Hub — limites de pull e de repositórios privados no plano gratuito.
- Registry próprio (`registry:2`) no servidor — mais um serviço para manter sem ganho para um único servidor.

**Consequences**
O build roda no servidor (alguns minutos e uso de CPU durante o deploy). O servidor precisa de acesso de leitura ao repositório (deploy key só-leitura). Rollback = checkout da tag anterior + novo build. O GitHub Actions continua só para CI (lint, testes, build de verificação), sem publicar artefatos.

---

## ADR-028 — Rodar no glpi-srv usando o túnel `itcbr-tunnel` que já existe

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
ADR-011 previa um container `cloudflared` próprio com `TUNNEL_TOKEN` e nenhuma porta no host. A documentação do servidor (`guia-servidor-glpi-srv.md`, `licoes-aprendidas-glpi-srv.md`) mostra que o `glpi-srv` já roda o `cloudflared` como serviço do host, com o túnel `itcbr-tunnel` e `config.yml` local apontando cada subdomínio para `localhost:<porta>`; e que instalar o cloudflared por token ignora o `config.yml` (lição 6). Todos os serviços Docker do servidor seguem esse padrão, e o deploy por GitHub Actions já existe com o usuário `github-deploy` (Diario Monitor).

**Decision**
Publicar o app em `127.0.0.1:3021` e adicionar `tasks.itcbr.xyz → http://localhost:3021` ao `itcbr-tunnel`; sem container de túnel. Repositório e `.env` em `/home/glpissh/docker/itc-tasks` (padrão `~/docker/<nome>` do servidor, igual ao NoteScan), com a pasta pertencendo ao `github-deploy` e acesso ao GitHub por deploy key só-leitura; deploy por GitHub Actions via SSH como `github-deploy` executando `scripts/deploy.sh`.

**Alternatives considered**
- Container `cloudflared` próprio com token (ADR-011) — segundo túnel para manter e foge do padrão do servidor.
- Porta em `0.0.0.0` com regra no UFW, como os outros serviços — desnecessário: o túnel usa `localhost` e o acesso interno pode ir pela Tailscale com `ssh -L` se preciso.

**Consequences**
O app depende da `eno8403` (RB750r2/Claro) para acesso externo, como os demais serviços do `itcbr.xyz`; GLPI e RustDesk não são afetados. O Postgres do ITC Tasks é exclusivo (`itc-tasks-db`), sem porta no host. Nenhum label do Watchtower. O registro do serviço na documentação do servidor faz parte do Módulo 12.

---

## ADR-029 — Seguir o fluxo de Git, CI e deploy do ITC NoteScan

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
O ITC NoteScan já roda no mesmo servidor (`glpi-srv`, `notescan.itcbr.xyz`, porta 3010) com um fluxo testado: `develop` → PR → `main` protegida, CI "Quality Check", deploy por GitHub Actions via SSH como `github-deploy` na porta 2222, migrações no entrypoint do container. A documentação dele também registra que o CodeQL foi removido porque o GitHub Advanced Security não está disponível no plano gratuito para repositórios privados da org ITC-Brasil, e que faltar o host confiável no Auth.js gerou `UntrustedHost` em produção.

**Decision**
Adotar no ITC Tasks o mesmo fluxo: branches `feat/…` → `develop` → `main` (PR, 1 aprovação, CI obrigatório); `ci.yml` com typecheck, lint com `eslint-plugin-security`, migrações, Vitest com cobertura e `npm audit --audit-level=high`; Gitleaks e Dependabot (minor/patch); sem CodeQL; deploy por `deploy.yml` com os secrets `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; migrações no entrypoint.

**Alternatives considered**
- Fluxo próprio do ITC Tasks com PR por módulo direto na `main` — duas formas de trabalhar no mesmo time e no mesmo servidor.
- Manter CodeQL — indisponível sem custo para repositório privado.

**Consequences**
O time usa um só modelo mental para os dois apps. Análise estática fica limitada ao ESLint security plugin.

> Alterado pelo ADR-033 (audit só de produção; Gitleaks por imagem) e pelo ADR-034 (`main` protegida por disciplina e hook local, sem branch protection do GitHub). O Postgres local de desenvolvimento usa a porta `5435` (o NoteScan local usa `5434`).

---

## ADR-030 — Conversa assíncrona entre o Claude Code e o Cowork em `.conversa/`

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
Cada módulo roda numa sessão nova do Claude Code, que escreve o código. Entre as paradas de
aprovação, o Claude no Cowork (projeto ITC Tasks, com a mesma pasta local conectada) revisa o
módulo. As duas sessões não compartilham conversa; só os arquivos. O `docs/PROGRESS.md` guarda o
estado do projeto, mas não é lugar para achados de revisão, perguntas e pedidos entre as sessões.

**Decision**
Criar a pasta `.conversa/`, fora do Git, com dois arquivos de mão única:
`para-claude-code.md` (só o Cowork escreve) e `para-cowork.md` (só o Claude Code escreve).
Mensagens numeradas `M-NNN`, com status `ABERTA`/`RESPONDIDA`, nunca apagadas. O Claude Code lê a
caixa dele no início de cada sessão e, no fim de cada módulo, avisa "Módulo NN pronto para
revisão". Toda decisão tomada na conversa vai para um ADR ou para o PROGRESS. Nenhum segredo nos
arquivos.

**Alternatives considered**
- Só o `docs/PROGRESS.md` — mistura estado do projeto com conversa de revisão.
- Um arquivo único de conversa — as duas sessões escreveriam no mesmo arquivo e uma poderia sobrescrever a outra.
- Conversa versionada no Git — ruído no histórico e risco de expor notas de trabalho no GitHub.

**Consequences**
Nenhuma das sessões é avisada de mensagem nova: o Matheus pede "leia a conversa". Como a pasta
não tem backup, o que importa precisa migrar para `docs/`. O Cowork só edita
`.conversa/para-claude-code.md` sem pedido explícito e não roda comandos git que alteram o
repositório.

**Instruções do projeto ITC Tasks no Cowork** (colar em Projeto › Instruções):

```
A fonte da verdade do ITC Tasks é a pasta itc-tasks conectada a este projeto.
O Claude Code escreve o código nessa pasta. Você revisa os módulos entre as paradas.

No início de cada chat:
1. Leia docs/PROGRESS.md para saber o estado atual.
2. Leia .conversa/para-cowork.md e trate as mensagens ABERTAS.
3. Leia CLAUDE.md para as regras do projeto.
4. Leia os outros arquivos de docs/ só quando o assunto pedir.

Regras:
- O único arquivo que você pode editar sem pedido é .conversa/para-claude-code.md.
- Para responder, crie uma mensagem que cite o número da mensagem do Claude Code.
- Não edite outros arquivos da pasta sem pedido explícito do Matheus.
- Não rode comandos git que alteram o repositório (commit, pull, checkout, stash).
- Para ver o que mudou, use git log, git status e git diff, que só leem.
- Nunca escreva segredos (senhas, tokens, chaves) na conversa.
- Ignore a pasta repo/ do Contexto: é uma cópia antiga.
```

---

## ADR-031 — npm como gerenciador de pacotes, não pnpm

**Status:** Accepted
**Date:** 2026-10-17
**Module:** Pre-implementation

**Context**
A documentação inicial previa pnpm 12.14.0. O Matheus e os outros projetos da ITC usam npm, e
o desenvolvimento é no Windows, onde o npm já vem com o Node.

**Decision**
Usar o npm que vem com o Node 24.22.0 (npm 11.19.1). Lockfile `package-lock.json`, commitado.
`npm ci` no CI e no `Dockerfile`; `npm install --save-exact <pkg>@<versão>` para adicionar
dependência; `.npmrc` na raiz com `save-exact=true` e `engine-strict=true`; `package.json` com
`"engines": { "node": ">=24.22.0 <25" }`. Scripts sempre por `npm run <script>`; ferramentas
avulsas por `npx`. Nunca pnpm nem yarn.

**Alternatives considered**
- pnpm — mais rápido e econômico em disco, mas é uma ferramenta a mais para instalar e um fluxo diferente do resto do time.
- yarn — mesma desvantagem, sem ganho para um projeto deste tamanho.

**Consequences**
Instalação um pouco mais lenta e `node_modules` maior; sem impacto em produção. O Dependabot usa
o ecossistema `npm`. Um só gerenciador em todos os projetos da ITC.

---

## ADR-032 — TypeScript 7 lado a lado com o TypeScript 6 para as ferramentas

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 00 — Fundação

**Context**
O `eslint-config-next@16.4.2` depende do typescript-eslint, que recusa carregar com o TypeScript 7.0
("typescript-eslint does not support TS 7.0"; suporte acompanhado em typescript-eslint#10940 para TS ≥ 7.1).
Com `typescript@7.0.2` direto, `npm run lint` quebra.

**Decision**
Seguir o modo "lado a lado" do anúncio do TypeScript 7.0, com aliases do npm:
`"@typescript/native": "npm:typescript@7.0.2"` (compilador do `typecheck`) e
`"typescript": "npm:@typescript/typescript6@6.0.2"` (API importada pelo typescript-eslint e pelo Next).
`npm run typecheck` = `next typegen` + `tsc` do TS 7 com `--noEmit`.

**Alternatives considered**
- Só TypeScript 6.0.3 — mais simples, mas abre mão do TS 7 previsto na stack.
- Tirar `eslint-config-next/typescript` — perde as regras de lint para TypeScript.

**Consequences**
Duas versões do TypeScript no `node_modules`. A checagem de tipos vale pelo TS 7; o lint usa o TS 6.
Quando o typescript-eslint suportar o TS 7, remover o alias e voltar a `typescript@7`.

---

## ADR-033 — Ajustes de CI do Módulo 00

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 00 — Fundação

**Context**
O ADR-029 previa `npm audit --audit-level=high` e Gitleaks no CI. No Módulo 00, o audit completo
falha por `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm), que não tem versão corrigida e só chega por
ferramentas de desenvolvimento (`eslint-config-next`, `shadcn`, `@ts-morph`; `esbuild` via `drizzle-kit`).
A `gitleaks/gitleaks-action` exige licença paga em repositório de organização.

**Decision**
Altera o ADR-029 em dois pontos:
- `ci.yml` roda `npm audit --omit=dev --audit-level=high` (só dependências de produção).
- `security.yml` roda a imagem oficial `ghcr.io/gitleaks/gitleaks` (v8.30.1) fixada por digest, no histórico inteiro.

**Alternatives considered**
- Audit completo com `--audit-level=critical` — esconderia também falhas altas de produção.
- `overrides` do `braces` — não existe versão corrigida para apontar.
- Licença da gitleaks-action — custo sem ganho sobre o binário.

**Consequences**
Falhas em ferramentas de dev não bloqueiam o CI; voltar ao audit completo quando sair a correção do
`braces`. O Gitleaks é atualizado trocando o digest à mão (o Dependabot não acompanha a imagem).

---

## ADR-034 — Proteção da main por disciplina

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 00 — Fundação

**Context**
O ADR-029 previa a `main` protegida (PR, 1 aprovação, CI obrigatório). A API do GitHub devolve
HTTP 403 ("Upgrade to GitHub Pro or make this repository public") para branch protection e rulesets
em repositório privado da org ITC-Brasil no plano gratuito.

**Decision**
Merge na `main` só por PR `develop → main` com CI verde, garantido por disciplina:
hook `.githooks/pre-push` que recusa push para `refs/heads/main` (passa só com `ALLOW_MAIN_PUSH=1`,
para emergência), ativado com `git config core.hooksPath .githooks` logo depois de clonar, e a regra
escrita no `CLAUDE.md`.

**Alternatives considered**
- GitHub Team — resolve, mas tem custo por usuário.
- Repositório público — liberaria a proteção, mas expõe `docs/INFRA.md` (servidor, portas, usuários).

**Consequences**
O hook não impede push pela interface web, nem de uma máquina onde o `core.hooksPath` não foi
configurado, nem com `--no-verify`. O CI continua rodando no PR, mas não bloqueia o merge.
Altera o ADR-029 no ponto "main protegida".

---

## ADR-035 — Ajuste de contraste dos tokens

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 00 — Fundação

**Context**
O axe do E2E do Módulo 00 apontou dois contrastes abaixo de 4,5:1 no tema claro, que o Design System
listava como exceção aceita: branco sobre o botão primário `#008F95` (3,92:1) e `text-muted`
`#697272` sobre `bg-base` (4,36:1).

**Decision**
No tema claro: `--text-muted` passa a `#636C6C` (4,76:1 sobre `bg-base`); novo token
`--accent-solid` `#007A80` (branco em cima: 5,13:1) com hover `--accent-solid-hover` `#006C72`,
usado em toda superfície com `on-accent` (botão primário, checkbox marcado, switch ligado; mapeado
também em `--color-primary`). `--accent` `#008F95` continua para anel de foco, item ativo, bordas e
marca. Tema escuro sem mudança (`on-accent` sobre `#30A5AB` já dá 5,74:1). A regra `color-contrast`
do axe volta a valer no E2E.

**Alternatives considered**
- Manter os valores da marca como exceção — falha WCAG 2.2 AA em rótulos de botão e metadados.
- Escurecer o `--accent` inteiro — muda a cor da marca em foco, item ativo e logo.

**Consequences**
Botão primário um tom mais escuro que o ciano da marca no claro. O Design System no Claude Design é
atualizado pelo Cowork. Componentes novos com `on-accent` usam `bg-accent-solid`, nunca `bg-accent`.

---

## ADR-036 — `cacheComponents` e `partialPrefetching` ligados no Next 16

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 00 — Fundação

**Context**
O `create-next-app@16.4.2` gera o `next.config.ts` com `cacheComponents: true` e
`partialPrefetching: true`. Nenhum documento previa as duas opções, e elas mudam como páginas e rotas
buscam dados: com `cacheComponents`, o que não está marcado com `"use cache"` é dinâmico e precisa
estar sob `<Suspense>` ou sinalizar a requisição (`await connection()`, `cookies()`, `headers()`).

**Decision**
Manter as duas ligadas, como o scaffold do Next 16.4 entrega. Dados por usuário (tarefas, sessão,
notificações) ficam dinâmicos; cache explícito com `"use cache"` só onde houver dado compartilhado
(cadastros, workflow). Rotas sem leitura de requisição chamam `await connection()` antes de tocar o
banco, como em `src/app/api/health/route.ts`.

**Alternatives considered**
- Desligar as duas — volta ao modelo do Next 15, mas contra o padrão do framework na versão adotada
  e sem o prefetch parcial das telas.

**Consequences**
Validado no Módulo 00: `next build` passa, `/` sai estático e `/api/health` dinâmico (200/503 com o
banco no ar e fora). Cada módulo novo precisa lembrar que leitura de banco fora de `<Suspense>` sem
sinal de requisição quebra o build ou é pré-renderizada.

---

## ADR-037 — Membros: papel `member`, desativação por ban e seed em JS

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 01 — Autenticação e membros

**Context**
O plugin `admin` do Better Auth 1.7.10 conhece os papéis `admin` e `user`; o produto usa `admin` e
`member`. A PRD pede "desativar" membros, e o ADR-018 proíbe excluir cadastros. O seed do primeiro
admin precisa rodar no dev e dentro da imagem standalone, que não tem `tsx` nem os aliases `@/`.

**Decision**
- `admin({ roles: { admin: adminAc, member: userAc }, defaultRole: "member", adminRoles: ["admin"] })`
  em `src/server/auth.ts`: `member` tem as permissões de `user` do plugin. Passar `ac: defaultAc`
  quebra a tipagem no TS 7, então o `ac` padrão fica implícito.
- Desativar = `banned = true` (campo do plugin `admin`), feito em `src/server/services/members.ts`,
  que também apaga as sessões do usuário na mesma transação. O Better Auth já recusa login de banido
  (`BANNED_USER`, 403).
- Ninguém altera o próprio papel nem se desativa (`MemberError`), o que garante sempre um admin ativo.
- `src/db/seed.mjs` em JS puro com `pg` e `@node-rs/argon2`, idempotente (`ON CONFLICT (email) DO
  NOTHING`), copiado para `dist/seed.mjs` na imagem.

**Alternatives considered**
- Coluna própria `archived_at` em `user` — duplicaria o `banned` que o Better Auth já respeita no login.
- Seed em TypeScript com `tsx` — dependência a mais e não roda na imagem standalone.
- Seed por `auth.api.createUser` — exige carregar o app inteiro (env, aliases) fora do Next.

**Consequences**
O seed repete os parâmetros do Argon2id de `src/server/auth.ts`; mudar um exige mudar o outro.
Seletores de responsável (Módulo 04) devem filtrar `banned = false`.

---

## ADR-038 — Tema e sidebar: preferência no usuário, aplicação sem flash no cliente

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 02 — Layout, navegação e tema

**Context**
O ADR-013 pede o tema salvo em `user.theme` e "aplicado no servidor para evitar flash". Com
`cacheComponents` (ADR-036), o layout raiz é pré-renderizado: ler a sessão ou um cookie ali para
escrever `data-theme` no `<html>` torna a rota inteira dinâmica e quebra o build fora de `Suspense`.

**Decision**
- `next-themes` 0.4.6 no layout raiz (`attribute="data-theme"`, `themes={["light","dark"]}`,
  `enableSystem={false}`, `defaultTheme="light"`). O script inline dele aplica o tema salvo no
  `localStorage` antes da pintura: sem flash no mesmo aparelho.
- `user.theme` continua a fonte da verdade. O shell do grupo `(app)` (dinâmico, dentro de
  `Suspense`) lê o valor do banco e, se diferir do aplicado, chama `setTheme` no primeiro efeito.
- Trocar o tema grava em `user.theme` por `preferencesService.setTheme(actor, theme)`.
- `user.sidebarCollapsed` é lido no servidor junto com a sessão e vira o estado inicial da sidebar,
  então ela já chega na largura certa (sem flash). O atalho `[` alterna e grava pelo mesmo service.

**Alternatives considered**
- Cookie de tema lido no layout raiz — exige layout raiz dinâmico, contra o ADR-036.
- Desligar `cacheComponents` — perde a navegação instantânea por um detalhe de primeira visita.

**Consequences**
No primeiro acesso de um aparelho novo (ou depois de limpar os dados do navegador) o tema claro pode
aparecer por um instante antes de o shell aplicar o escuro salvo. Telas fora do `(app)` (Entrar)
usam o último tema do aparelho. O ADR-013 segue valendo; este ADR só troca o "aplicado no servidor".

---

## ADR-039 — Ajuste de contraste do tema escuro

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 02 — Layout, navegação e tema

**Context**
O Módulo 02 liga o tema escuro, e o axe (`color-contrast`, ligado pelo ADR-035) acusou dois pares
abaixo de 4,5:1 no escuro: `accent-text` (`#30A5AB`) sobre o item ativo da navegação
(`accent-light` sobre `bg-surface`, ≈ `#213938`): 4,15:1; e o botão destrutivo, `on-accent`
(`#08201F`) sobre `err` (`#D75A4A`): 4,41:1.

**Decision**
- Escuro: `--accent-text: var(--accent-hover)` (`#46B5BA`): 5,03:1 sobre o item ativo, 6,45:1 sobre
  `bg-surface`, 7,26:1 sobre `bg-base`. `--accent` continua `#30A5AB` (foco, bordas, marca).
- Token novo `--on-err` para texto sobre `err`: claro `#FFFFFF` (5,44:1 sobre `#C0392B`), escuro
  `#141918` (4,61:1 sobre `#D75A4A`). O botão destrutivo passa a usar `text-on-err`.
- O claro não muda.

**Alternatives considered**
- Escurecer `accent-light` no escuro — mexe em todas as superfícies de destaque, não só no texto.
- Clarear `err` no escuro — o vermelho perde força como cor de estado.

**Consequences**
O Design System no Claude Design precisa dos dois valores (o Cowork atualiza). A auditoria completa
dos dois temas continua no Módulo 11.

## ADR-040 — Regras dos cadastros: normalização, categoria fixa e um status ativo por categoria

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 03 — Cadastros

**Context**
O PRD (C1–C3, W1–W2) pede sigla única, código de UM único, etiquetas e status configuráveis, mas
não diz se a unicidade diferencia maiúsculas, se a categoria de um status pode mudar, nem o que
acontece ao arquivar o último status de uma categoria. Escrito no fechamento do módulo, junto com
o código (deveria ter vindo antes; registrado no PROGRESS).

**Decision**
- Normalização no Zod (`src/lib/validation/catalog.ts`): sigla e código de UM em maiúsculas, nome
  de etiqueta em minúsculas. Os índices únicos (`projects_code_uq`, `mobile_units_code_uq`,
  `labels_name_uq`) passam a valer sem diferenciar caixa; a violação `23505` vira mensagem
  ("Já existe um Projeto/Cliente com a sigla TRL").
- A categoria do status (ADR-022) é escolhida na criação e não muda; só o nome é editável
  (`renameStatus`). Trocar a categoria mudaria em silêncio o sentido das tarefas já no status
  (`completedAt`).
- Cada categoria mantém ao menos um status ativo: `setStatusArchived` recusa o último, com
  `SELECT … FOR UPDATE` na categoria contra dois arquivamentos simultâneos.
- Cliente de UM: um cliente novo precisa estar ativo; o atual pode continuar mesmo arquivado.
- Escrita de cadastros só para admin; leitura (`list*`) para qualquer actor, sem arquivados por
  padrão (`includeArchived` nas telas de Configurações).

**Alternatives considered**
- Índice único em `lower(code)`: exige migração e o dado continuaria com caixa misturada.
- Categoria editável com migração das tarefas: sem caso de uso no MVP.
- Permitir categoria vazia: o Kanban e o "concluir" (W2) ficariam sem destino.

**Consequences**
A ordem muda por troca com o vizinho (subir/descer); arrastar fica para o Kanban (Módulo 05). A
posição de um status novo é `max + 1` sem trava: dois admins criando ao mesmo tempo podem empatar a
posição, o que só afeta a ordem.

## ADR-041 — Paleta própria das etiquetas

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 03 — Cadastros (ajuste da M-018)

**Context**
As etiquetas usavam `info`, `ok`, `warn`, `sev-medium`, `bordo` e `accent`. As quatro primeiras são
cores funcionais que o `CLAUDE.md` reserva para estado: uma etiqueta "rede" em `info` se confunde
com um aviso. Decisão do Matheus na M-018.

**Decision**
- Sete tokens `--label-*` em `src/styles/globals.css`, distintos das cores funcionais. Contraste do
  ponto contra `--bg-surface` (mínimo 3:1, WCAG 1.4.11):

| Token | Claro | vs `#FDFBF7` | Escuro | vs `#1E2422` |
|---|---|---|---|---|
| `label-teal` | `#1F7F6B` | 4,72:1 | `#4FB89E` | 6,52:1 |
| `label-blue` | `#3D5BD9` | 5,50:1 | `#7F96F2` | 5,67:1 |
| `label-plum` | `#8A3F8F` | 6,37:1 | `#C483C9` | 5,59:1 |
| `label-rose` | `#C02A5E` | 5,44:1 | `#EC7099` | 5,52:1 |
| `label-olive` | `#6A7A1C` | 4,60:1 | `#A9BA4C` | 7,38:1 |
| `label-brown` | `#9A5A2C` | 5,25:1 | `#D18D5C` | 5,77:1 |
| `label-slate` | `#5B6B7B` | 5,30:1 | `#9AA9B8` | 6,57:1 |

- `labels.color_token` guarda o nome sem o prefixo de CSS (`label-blue`); `LABEL_COLORS` só aceita
  esses sete.
- Migração `0004_label_palette`: `UPDATE` que só renomeia o token (`info`→`label-blue`,
  `sev-medium`→`label-plum`, `bordo`→`label-rose`, `accent`→`label-teal`, `ok`→`label-olive`,
  `warn`→`label-brown`). Não é reescrita de dado de negócio: o nome, o arquivamento e os vínculos
  da etiqueta não mudam; muda só a referência de cor, que é apresentação. Exceção registrada à regra
  "migrações só aditivas".
- Seed: rede `label-blue`, hardware `label-plum`, segurança `label-rose`, campo `label-teal`.

**Alternatives considered**
- Manter os tokens funcionais — mistura etiqueta com estado.
- Hex livre por etiqueta — contra o princípio do Design System (nunca hex no dado).

**Consequences**
O Design System no Claude Design recebe os sete tokens (o Cowork atualiza). A cor continua só como
ponto de fundo; o nome da etiqueta usa a cor de texto normal.

---

## ADR-042 — Núcleo das tarefas: tabelas de planejamento antecipadas, posição e histórico

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 04 — Tarefas: núcleo

**Context**
`tasks` referencia `cycles` e `milestones` (Módulo 10), e a criação rápida usa `templates`
(Módulo 09). A posição (ADR-014) precisa de um gerador de índice fracionário, e o histórico
(`task_events`) precisa de um formato fixo antes de o MCP e as automações gravarem nele.

**Decision**
- A migração do Módulo 04 cria `cycles`, `milestones` e `templates` como em `docs/SCHEMA.md`, sem
  tela. Assim as FKs de `tasks` nascem completas e nenhuma migração futura altera `tasks`.
- `fractional-indexing` 4.0.0 (`generateKeyBetween`) gera `tasks.position` e
  `checklist_items.position`. Tarefa nova vai para o fim do seu status; empate de chave em criações
  simultâneas é tolerado (ordem por `position`, depois `number`).
- Status padrão na criação: o primeiro (por `position`) ativo de categoria `todo`. `complete` move
  para o primeiro ativo de categoria `done` e é idempotente. Entrar em `done` grava `completedAt`;
  sair limpa (ADR-022). Status arquivado é recusado.
- Descrição: Tiptap JSON em `description_json`; o service extrai `description_text` percorrendo os
  nós `text` (sem carregar o Tiptap no servidor).
- `task_events`: um evento por mudança. Tipos: `created`, `status_changed`, `assigned`,
  `field_changed`, `labels_changed`, `checklist_changed`, `link_added`, `link_removed`.
  Payload `{ field?, from?, to? }` com IDs ou valores crus (o Módulo 06 formata para a tela).
  Ator: `actor_kind` + `actor_user_id`/`api_key_id`/`automation_rule_id` a partir do `Actor`.
- Qualquer `user`/`agent` escreve em qualquer tarefa (time de 4); `automation`/`system` também.
  `creator_id` de tarefa criada por automação/sistema fica com o responsável padrão do projeto ou,
  sem ele, o primeiro admin (a coluna é `NOT NULL`).
- `NOTIFY task_changed` e as filas do pg-boss entram nos Módulos 06 e 08.

**Alternatives considered**
- `cycle_id`/`milestone_id` sem FK até o Módulo 10 — exigiria alterar `tasks` depois.
- Posição inteira com renumeração — reescreve linhas a cada arrasto.
- Gerar chaves fracionárias à mão — o algoritmo tem casos de borda (prefixos, inteiros) já
  resolvidos na biblioteca.

**Consequences**
`cycles`, `milestones` e `templates` ficam vazias até os Módulos 09 e 10; o seletor de template
da criação rápida só aparece quando houver templates.

---

## ADR-043 — Responsável padrão e Unidade Móvel do cliente aplicados no service

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 04 — Tarefas: núcleo (ajuste da M-022)

**Context**
No Módulo 04 só a criação rápida preenchia o responsável padrão do projeto e filtrava as UMs pelo
cliente. Tarefas criadas pelo MCP (Módulo 07) ou por automações (Módulo 09) escapariam das duas
regras. Decisão do Matheus na M-022.

**Decision**
- `createTask`: `assigneeId` **omitido** recebe `projects.default_assignee_id`; `null` explícito
  cria sem responsável.
- UM com `project_id` só vale para tarefas desse Projeto/Cliente; UM sem cliente vale para qualquer
  projeto. Fora disso, `TaskError("VALIDATION", "A Unidade Móvel <código> pertence a outro
  Projeto/Cliente")`. Em `update`, a regra é conferida com o projeto e a UM resultantes: trocar o
  projeto mantendo uma UM incompatível também é recusado.

**Alternatives considered**
- Manter as regras só na tela — o MCP e as automações gravariam combinações que a tela não permite.
- Limpar a UM incompatível em silêncio ao trocar o projeto — perde dado sem o usuário perceber.

**Consequences**
A criação rápida continua preenchendo o responsável para mostrar o valor antes de criar; o service
garante a regra para os outros caminhos.

---

## ADR-044 — Cadastros reais: sigla até 12 caracteres, tipo "Projeto" e UM sempre com Projeto/Cliente

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 04 — pós-revisão (M-024)

**Context**
Os cadastros reais da ITC têm siglas como `BSBIA`, `CODHAB` e `MOBILITY` (mais de 4 letras) e três
naturezas: projeto, cliente e interno. O ADR-040 limitava a sigla a 2–4 letras e o enum
`project_kind` tinha só `client` e `internal`. Decisões do Matheus na M-024.

**Decision**
- Sigla: letras maiúsculas e dígitos, 2 a 12 caracteres (`/^[A-Z0-9]{2,12}$/`), única. O limite é
  só técnico, para caber no Chip. Substitui a regra de sigla do ADR-040.
- `project_kind` ganha `project` (migração `ALTER TYPE … ADD VALUE`, aditiva). Rótulos: `project`
  "Projeto", `client` "Cliente", `internal` "Interno". Tipo padrão na tela: Projeto.
- Toda UM nova ou editada exige Projeto/Cliente (Zod e service). A coluna `mobile_units.project_id`
  continua anulável no banco (migrações só aditivas); UM antiga sem cliente segue a regra do
  ADR-043 até ser editada.
- Seed (`src/db/seed.mjs`): os 9 Projetos/Clientes e 12 UMs da M-024, inseridos com
  `ON CONFLICT (code) DO NOTHING` — nunca sobrescreve o que o admin mudou. `ACL` continua.

**Alternatives considered**
- Sigla sem limite — quebra o Chip e a tabela.
- Novo enum ou coluna para o tipo — exigiria reescrita de dado; `ADD VALUE` é aditivo.
- `project_id NOT NULL` em `mobile_units` — falharia com UMs já criadas sem cliente.

**Consequences**
O PRD C1/C2 e o SCHEMA passam a citar a nova sigla e os três tipos. `ADD VALUE` não pode ser usado
na mesma transação em que é criado: a migração só adiciona o valor.

---

## ADR-045 — Sem responsável automático; vários Projetos/Clientes e UMs por tarefa

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 04 — pós-revisão (M-026)

**Context**
Uma tarefa da ITC costuma envolver mais de um Projeto/Cliente (ex.: rede compartilhada entre BSBIA e
SEDET) e mais de uma Unidade Móvel. E o responsável é sempre escolhido por quem cria a tarefa, não
pelo projeto. Decisões do Matheus na M-026; substitui a parte 1 do ADR-043.

**Decision**
- **Sem responsável automático.** `createTask` não usa `projects.default_assignee_id`; omitido = sem
  responsável. A criação rápida não pré-preenche, e o campo sai da tela de Projetos e do Zod do
  projeto. A coluna fica no banco, sem uso (migração só aditiva). `creatorFor` (automação/sistema)
  usa só o primeiro admin ativo.
- **Tabelas `task_projects (task_id, project_id)` e `task_mobile_units (task_id, mobile_unit_id)`**,
  PK composta, `ON DELETE cascade` na tarefa. São a fonte de verdade dos vínculos.
- **`tasks.project_id` = projeto principal** (o primeiro da lista), sempre presente também em
  `task_projects`; segue `NOT NULL`, o que mantém "pelo menos um Projeto/Cliente" no banco.
  `tasks.mobile_unit_id` = primeira UM ou `null`. Os dois são atualizados pelo service a cada
  mudança das listas.
- Zod e service recebem `projectIds` (1 a 10, o primeiro é o principal) e `mobileUnitIds` (até 20).
  Sem projeto: "Escolha um Projeto/Cliente para criar a tarefa."
- **UM × projeto** (substitui a parte 2 do ADR-043): cada UM com cliente tem de pertencer a um dos
  projetos da tarefa. Remover um projeto que ainda tem UM sua na tarefa é recusado ("Remova antes
  a UM X: ela é do Projeto/Cliente Y"). UM antiga sem cliente vale para qualquer projeto.
- `task_events`: `projects_changed` e `mobile_units_changed` com `{ from, to }` (listas de IDs),
  no lugar do `field_changed` de `projectId`/`mobileUnitId`.
- Migração `0007_task_links_many`: cria as tabelas e faz `INSERT … SELECT` a partir de
  `tasks.project_id`/`mobile_unit_id` (cópia aditiva, não reescreve linha existente).

**Alternatives considered**
- `tasks.project_id` sem uso, só `task_projects` — o `NOT NULL` precisaria de valor fictício e a
  regra "pelo menos um" ficaria só no service.
- Arrays (`uuid[]`) em `tasks` — sem FK por elemento; arquivamento e filtros ficam frágeis.

**Consequences**
Filtros e contagens do Módulo 05 e as ferramentas do MCP (Módulo 07) consultam `task_projects` e
`task_mobile_units`; `create_task`/`update_task` aceitam `projectIds[]`/`mobileUnitIds[]`.

## ADR-046 — Visões: filtros na URL, uma consulta para todas as visões e filtros salvos

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 05 — Visões e filtros

**Context**
Kanban, Lista, Calendário e Minhas tarefas mostram o mesmo conjunto de tarefas com os mesmos
filtros (PRD V1–V5). Os filtros precisam sobreviver a recarregar a página, ser compartilháveis por
link e poder ser salvos por pessoa.

**Decision**
- **Filtros na URL** (`?responsavel=…&projeto=…&um=…&prioridade=…&etiqueta=…&status=…`), valores
  repetidos para "qualquer um de". Um só schema Zod (`taskFiltersSchema`) lê a URL no servidor; as
  páginas são Server Components que chamam `listTasks(actor, filtros)`.
- **Uma consulta** (`listTasks`) serve as três visões e Minhas tarefas; Projeto/Cliente e UM
  filtram por `task_projects`/`task_mobile_units` (ADR-045), ou seja, por qualquer vínculo.
  Tarefas arquivadas ficam de fora. Limite de 1 000 linhas (o time tem 4 pessoas).
- Visões em `/tarefas` (Kanban), `/tarefas/lista` e `/tarefas/calendario`; o seletor de visão
  mantém a query string.
- **Kanban** com `@dnd-kit/react` e `moveTask` (posição fracionária, ADR-014). A UI move o card na
  hora (otimista) e desfaz com toast se a action falhar.
- **Lista** com TanStack Table (seleção e ordenação no cliente) e ações em massa via
  `bulkUpdateTasks`: status, responsável e prioridade. "Mudar ciclo" fica para o Módulo 10 (ciclos)
  e "arquivar" para quando houver o fluxo de arquivar tarefa.
- **Calendário** mensal feito à mão (grade CSS de 7 colunas), sem biblioteca; mostra prazos.
  Marcos entram no Módulo 10.
- **Filtros salvos** em `saved_filters (user_id, name, view, filters jsonb)` — migração aditiva
  `0008_saved_filters`, como já desenhado no SCHEMA. `filters` guarda a query string validada pelo
  mesmo schema; só o dono lê e apaga os seus.
- "Ciclo" entra nos filtros no Módulo 10, junto com os ciclos.

**Alternatives considered**
- Estado de filtro só no cliente (TanStack Query + store) — perde o link compartilhável e duplica a
  leitura que o Server Component já faz.
- Biblioteca de calendário — uma grade mensal só com prazos não justifica a dependência.

**Consequences**
Mudar filtro é navegação (`router.replace`), não fetch próprio. Filtros salvos de visões futuras
reaproveitam o mesmo formato.

## ADR-047 — Concluídas recentes no Kanban e limite só nas concluídas (complementa o ADR-046)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 05 — revisão (M-034)

**Context**
O limite de 1 000 linhas do ADR-046 podia cortar tarefas abertas sem aviso, e a coluna de
concluídas do Kanban cresce sem fim. Decisão do Matheus na M-034.

**Decision**
- `listTasks` faz duas consultas: **abertas** (categoria ≠ `done`) **sem limite**, e **concluídas**
  ordenadas por `completed_at desc` com limite de 1 000. O resultado junta as duas e ordena por
  `position`; devolve `{ tasks, truncated }`, com `truncated` quando as concluídas batem no limite.
- No **Kanban** (opção `recentDone`), só entram concluídas com `completed_at` nos últimos
  **14 dias**. Lista, Calendário e o filtro de status mostram todas.
- Com `truncated`, a tela mostra "Mostrando as primeiras N tarefas concluídas; refine os filtros".

**Alternatives considered**
- Paginação na Lista — mais código para um time de 4 pessoas; o limite só atinge histórico.
- Limite único sobre todas — corta abertas, o que a M-034 proíbe.

**Consequences**
Abertas sempre aparecem inteiras. Índice em `saved_filters.user_id` entra na migração `0009`.

## ADR-048 — Comentários, histórico, anexos, busca e tempo real (Módulo 06)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 06 — Comentários, histórico, anexos e busca

**Context**
O Módulo 06 liga as tabelas `comments` e `attachments` (criadas na migração 0005), mostra o
`task_events` na tela, entrega a busca ⌘K e o SSE do ADR-020. As telas são Server Components sem
TanStack Query (ADR-046), então "invalidar queries" precisa de outro mecanismo.

**Decision**
- **Comentários:** `commentsService` com `Actor`. Editor Tiptap com `@tiptap/extension-mention`
  3.32.0 (mesma versão do Tiptap) e lista de pessoas ativas; `mentions` guarda os IDs de pessoas
  ativas citadas (o service confere no banco). O autor edita o próprio comentário (`edited_at`);
  não há exclusão. Cada comentário grava `task_events` `commented` com `{ commentId }`; edição
  grava `comment_edited`. Agente (Módulo 07) passa pelo mesmo service.
- **Aba "Menções"** em Minhas tarefas: tarefas abertas com comentário que menciona a pessoa.
- **Histórico:** comentários e `task_events` numa única linha do tempo, mais recente embaixo; o
  ator aparece como pessoa, "via MCP · <token>" (agente) ou "Automação". O payload cru do ADR-042 é
  formatado no servidor (nomes atuais de status, pessoas, projetos, UMs e etiquetas).
- **Anexos:** rotas `POST /api/attachments` e `GET /api/attachments/[id]` (API.md §5) chamam o
  `attachmentsService`. Limite de 25 MB conferido pelo `Content-Length` e pelo tamanho do arquivo
  antes de gravar; tipos permitidos: imagens, PDF, texto/CSV/log, JSON/XML, ZIP/7z e documentos
  Office/ODF (415 nos demais). Arquivo gravado em `UPLOADS_DIR/<uuid>` (sem o nome original no
  disco); download com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`.
  Evento `attachment_added`. Sem exclusão de anexo no MVP.
- **Busca ⌘K:** `cmdk` 1.1.1 (versão do CLAUDE.md). `searchTasks` numa consulta: `TI-142` ou só
  número → `number`; `#48213` → `glpi_ticket`; código de UM (com ou sem `UM-`) → `task_mobile_units`;
  texto → `tasks.search @@ to_tsquery('portuguese', …)` com prefixo (`termo:*`) por palavra, ordenado
  por `ts_rank`. Até 20 resultados, abertas antes de concluídas. A paleta também lista as telas da
  navegação e "Criar tarefa".
- **Tempo real:** `record()` (que toda escrita de tarefa já chama) faz `pg_notify('task_changed',
  { id, number, fields })` dentro da transação — o Postgres só entrega no commit. `/api/events` usa
  **um** `LISTEN` por processo (um cliente `pg` dedicado) e repassa a todas as abas conectadas;
  `ping` a cada 25 s. O cliente (`EventSource` no AppShell) chama `router.refresh()` com
  debounce de 500 ms; o `EventSource` reconecta sozinho. `notification.created` entra no Módulo 08.

**Alternatives considered**
- Menção por texto (`@nome`) com parse no servidor — ambíguo com nomes repetidos e sem lista na tela.
- Anexo em Server Action — limite de corpo de 1 MB por padrão e sem resposta 413/415 da API.md.
- `pg_trgm`/`ILIKE` para a busca — o `tsvector` já existe com índice GIN (migração 0005).
- Uma conexão `LISTEN` por aba — gasta conexões do pool à toa.
- TanStack Query só para invalidar — duplicaria a leitura que os Server Components já fazem.

**Consequences**
`router.refresh()` recarrega a tela inteira a cada mudança feita por outra pessoa ou agente (a
própria escrita é ignorada, e o refresh espera a pessoa terminar de arrastar/digitar); com 4 pessoas é
barato. Se pesar, filtrar pelo `id` da tarefa aberta. O backup precisa do volume `uploads`
(ADR-025).

---

## ADR-049 — Servidor MCP: transporte sem sessão, tokens e contrato (Módulo 07)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 07 — Servidor MCP

**Context**
O ADR-009 fixou o MCP embutido em `/mcp` com API key do Better Auth e 60 req/min por token. Faltava
decidir como o transporte guarda estado, como as permissões ficam no token, o que é "revogar", como
os erros de schema viram `VALIDATION` e como as ferramentas leem códigos legíveis.

**Decision**
- **Transporte sem sessão:** `WebStandardStreamableHTTPServerTransport` com
  `sessionIdGenerator: undefined` e `enableJsonResponse: true`; um `McpServer` novo por requisição.
  `GET` e `DELETE /mcp` → 405 (o servidor não manda mensagens por conta própria).
- **Autenticação:** `Authorization: Bearer itct_…` conferido por `auth.api.verifyApiKey`. Token
  inexistente, desativado ou expirado, ou dono desativado → 401. O rate limit é o do plugin (60/min
  por token, contado no banco) → 429 com `Retry-After: 60`. O agente vira
  `Actor { kind: "agent", userId: dono, role, apiKeyId }`.
- **Permissões no token:** `permissions = { tasks: ["read"] }` (só leitura) ou
  `{ tasks: ["read", "write"] }`. Cada ferramenta exige `read` ou `write`; sem ela → `FORBIDDEN`.
- **Criar e revogar:** só pelo servidor (`auth.api.createApiKey` com `userId` e `permissions`; o
  cliente não define permissões). O segredo aparece uma única vez. Membro gerencia os próprios
  tokens; admin, os de qualquer pessoa. **Revogar = `enabled = false`**, sem excluir: `task_events`
  e `comments` apontam para `apikey.id` (ADR-018).
- **Erros:** `TaskError` → seu `code`; `ZodError` e erro de schema do SDK → `VALIDATION`;
  `ForbiddenError` → `FORBIDDEN`. O SDK 1.32.1 transforma a falha de schema em texto sem `code`; o
  `createToolError` interno é trocado para devolver `structuredContent: { code, message }` (coberto
  por teste, que quebra se o SDK mudar).
- **Referências legíveis** (código do projeto, código da UM, nome do status/etiqueta, e-mail ou
  `me`) são resolvidas no `agentsService` (`src/server/services/agents.ts`), que também monta
  `TaskSummary`. As ferramentas só validam, chamam services e mapeiam erros (ADR-003).
- **Markdown:** conversão mínima para Tiptap — parágrafos (linha em branco) e quebras de linha;
  `@email` de pessoa ativa vira menção. Na leitura, a descrição volta como texto (`docText`).
- **`list_tasks`:** usa o `listTasks` das visões (abertas + até 1 000 concluídas mais recentes);
  `query`, `category`, `dueBefore` e `overdue` filtram em memória; ordem `number desc`; `cursor` é o
  último número devolvido. `query` procura no título e no `#GLPI`, não na descrição.
- **Fora agora:** `cycle` em `create_task`, `update_task` e no filtro de `list_tasks` entra com o
  service de ciclos (Módulo 10); `list_cycles` já lê a tabela.

**Alternatives considered**
- Sessões em memória (`sessionIdGenerator`) — estado no processo sem ganho: nenhuma ferramenta é longa
  nem notifica o cliente.
- Excluir o token ao revogar — quebraria as referências do histórico.
- Schema frouxo no MCP (tudo `unknown`) para validar só no service — o agente perderia os tipos na
  listagem de ferramentas.
- Busca do `list_tasks` pelo `tsvector` — `searchTasks` devolve no máximo 20 e não combina com os filtros.

**Consequences**
Cada chamada faz `verifyApiKey` (uma escrita no `apikey` para o contador); com 60/min é barato. Se o
time crescer muito, `list_tasks` deve ir para uma consulta paginada no banco. Trocar o
`createToolError` depende de um detalhe interno do SDK: ao atualizar o SDK, o teste de `VALIDATION`
diz se ainda vale.

## ADR-050 — Notificações: worker, fila na transação, regras de destino e canais (Módulo 08)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 08 — Notificações

**Context**
O ADR-010 fixou o pg-boss num processo `worker` e o ADR-017 os três canais. Faltava decidir como o
evento chega à fila sem se perder, quem recebe o quê, como os canais se combinam e como o worker
TypeScript roda em produção.

**Decision**
- **Worker:** `worker/index.ts`. Em dev, `npm run worker:dev` (`tsx watch`); na imagem, o esbuild
  empacota tudo num `dist/worker.mjs` (`node dist/worker.mjs`), porque o `standalone` do Next só leva
  o que o app importa.
- **Fila na mesma transação:** `record()` (todo `task_event`) chama `enqueue(tx, "notification.fanout",
  { eventIds })`, que faz o `send` do pg-boss pela própria transação do Drizzle (opção `db`). Escrita
  desfeita não notifica; worker parado não perde nada. O processo web tem um `PgBoss` só para enviar
  (`supervise` e `schedule` desligados); quem iniciar primeiro, web ou worker, cria o schema `pgboss` e
  as filas (o pg-boss serializa a migração com advisory lock), para a escrita não depender de o
  worker já ter rodado.
- **Destinatários** (por escrita, no máximo uma notificação por pessoa e tipo):
  | Evento | Quem recebe | Tipo |
  |---|---|---|
  | `created` com responsável, `assigned` | novo responsável | `assigned` |
  | `commented` | mencionados no comentário | `mentioned` |
  | `commented` | responsável e criador (se não mencionados) | `commented` |
  | `created`/`field_changed` da descrição | mencionados **novos** na descrição | `mentioned` |
  | `status_changed` | criador | `status_changed` |
  | qualquer escrita de agente | responsável e criador sem outro aviso nesta escrita | `agent_action` |
  | 08:00, prazo hoje / venceu ontem (abertas) | responsável | `due_today` / `overdue` |
- **N4 — o próprio autor não recebe**, e o agente conta como o dono do token (o agente do Matheus não
  avisa o Matheus). Pessoa desativada não recebe.
- **Preferências:** linha ausente em `notification_preferences` = padrão da tela (no app em todos;
  push em atribuída, menção, prazo hoje e vencida; e-mail em prazo hoje e vencida). Não há seed das 7
  linhas: a tela grava só o que muda, e quem entrar depois já nasce com o padrão.
- **Uma linha em `notifications`** quando algum canal está ligado, com `in_app` e `email` copiados da
  preferência no momento (colunas novas, migração aditiva `0010`) e `emailed_at`. A central e o sino
  só mostram `in_app`.
- **Push:** job `notification.push` por notificação (falha de push não repete o fanout). Só dentro do
  expediente da pessoa (`quietHoursStart` ≤ agora < `quietHoursEnd`, fuso `APP_TIMEZONE`); fora dele,
  não envia (fica só no app). Resposta 404/410 → apaga a assinatura. Até o Serwist (Módulo 11),
  `public/push-sw.js` mínimo trata `push` e `notificationclick` (`sw.js` fica para o Serwist).
- **E-mail:** só o resumo diário. Job `daily.morning` às 08:00 (`APP_TIMEZONE`): primeiro os lembretes
  de prazo (sem duplicar no mesmo dia), depois um e-mail por pessoa com `emailDigest` ligado e
  notificações `email` sem `emailed_at`, que então são marcadas. Repetir o job não reenvia.
- **Tempo real:** `pg_notify('notification_created', { id, userId, event, unreadCount })` na transação
  do fanout; `/api/events` repassa `notification.created` só à aba da própria pessoa, sem o `userId`.
- **Configuração:** `VAPID_*` e `SMTP_*`/`MAIL_FROM` continuam opcionais no `env.ts` (build e CI rodam
  sem eles); o worker em produção recusa iniciar sem eles. Em dev, sem VAPID o push só é ignorado.
- **Telas:** Notificações em `/notificacoes` (Não lidas, Todas, Menções; marcar uma ou todas como
  lidas) e Configurações › Minhas preferências em `/config/preferencias` (tema, matriz evento × canal,
  push neste dispositivo, expediente e resumo). O silêncio fora do expediente é sempre ligado (sem o
  interruptor da tela de referência): basta ajustar o horário.

**Alternatives considered**
- Worker lendo `task_events` por cursor (outbox) — `task_events.id` é UUID e o `created_at` não
  garante ordem de commit; transações concorrentes perderiam eventos.
- Escutar o `NOTIFY task_changed` no worker — perde tudo o que acontecer com o worker parado.
- E-mail imediato por evento — o PRD pede resumo diário; e-mail a cada comentário vira ruído.
- Adiar o push fora do expediente para o início do dia seguinte — o resumo e a central já cobrem.
- Rodar o worker com `tsx` na imagem — leva o código-fonte e um transpilador para produção.

**Consequences**
Toda escrita de tarefa insere um job do pg-boss na mesma transação (uma linha a mais). Sem o worker
rodando, os jobs se acumulam e são processados quando ele subir. Ligar mais tipos de evento é acrescentar uma linha na tabela de destinatários.

## ADR-051 — O dono do token é avisado do que o próprio agente fez (complementa o ADR-050)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 08 — Notificações (revisão M-048)

**Context**
O ADR-050 tratou o agente como o dono do token no N4: o agente do Matheus não avisava o Matheus.
O Matheus decidiu que a pessoa deve saber o que o próprio agente fez, para rastreabilidade.

**Decision**
- Numa escrita de agente, o dono do token recebe `agent_action` (só esse tipo; não recebe
  `assigned`, `commented` etc. pela própria escrita do agente).
- O resto do N4 continua: o que a pessoa faz na UI nunca a avisa.
- Padrão de `agent_action`: só no app, sem push nem e-mail (já era o `DEFAULT_CHANNELS`);
  configurável em Minhas preferências.

**Alternatives considered**
- Manter o dono excluído (ADR-050) — perde a rastreabilidade pedida.
- Avisar o dono com todos os tipos (atribuída, comentário…) — repetiria o mesmo fato em vários avisos.

**Consequences**
Quem usa agente com frequência recebe um aviso no app por escrita do agente; se incomodar, desliga
em Minhas preferências.

## ADR-052 — Automações e templates: motor de regras, ações e uso de template (Módulo 09)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 09 — Automações e templates

**Context**
O PRD (A1–A4, P4) e o FLOWS §5 descrevem regras "Quando → Se → Então" avaliadas fora da requisição,
com proteção de laço, e templates de tarefa e de projeto. Faltava fixar como o evento chega ao motor,
o formato de condições e ações, o que fazer com as ações da tela que não estão no A3 e o que um
template de projeto cria.

**Decision**
- **Fila na transação:** `record()` enfileira `automation.evaluate` `{ eventIds, depth }` junto com o
  fanout (mesma transação, ADR-050), só quando algum evento é gatilho. `depth` = 0 para pessoa,
  agente e sistema; numa escrita de automação, a profundidade do job que a gerou + 1. O worker avalia;
  com `depth ≥ 3` não executa e grava `automation_runs` com erro "Cadeia de automações passou de 3".
- **Gatilhos:** `task.created` (`created`), `task.status_changed`, `task.assigned` (responsável novo
  não nulo), `task.priority_changed` (`field_changed` de `priority`) e `task.overdue` (job
  `automation.overdue` às 00:05 de `APP_TIMEZONE`, tarefas abertas com prazo ontem).
- **Condições** (todas precisam bater, sobre um retrato da tarefa tirado no início do job, para uma
  regra não reagir à ação de outra no mesmo job): categoria do status,
  prioridade, tem Chamado GLPI, tem Unidade Móvel. "Status muda para Concluído" = gatilho
  `task.status_changed` + condição "status é Concluído".
- **Ações** (em ordem, cada uma pelo service, com `Actor` `automation` que carrega `automationId` e
  `depth`): notificar (criador, responsável ou time), mover para status, mover para o ciclo ativo (sem
  ciclo ativo, não faz nada — ciclos chegam no Módulo 10), mover para o topo da coluna, adicionar
  etiqueta e comentar (texto com `{ID}` e `{GLPI}`). "Topo da coluna" entra além do A3 (decisão do
  Matheus); "marcar vencida" sai da regra 4, porque vencida já é derivada do prazo.
- **Notificar** cria o tipo novo `automation` em `notification_event` (padrão: só no app; configurável
  em Minhas preferências), com o nome da regra. "Time" = todas as pessoas ativas. Não passa pelo N4.
- **Comentário de automação:** autor = primeiro admin ativo (como o criador de tarefa de automação,
  ADR-045), `actor_kind = 'automation'`; a tela mostra "Automação".
- **Execução:** uma regra por vez; falha numa ação para a regra, grava `automation_runs` com o erro e
  segue para as próximas regras. `runCount++` e `lastRunAt` em toda execução (ok ou erro).
- **Tela:** Configurações › Automações (`/config/automacoes`), só admin: lista com liga/desliga,
  contador e última execução; criar e editar em diálogo. Regras não são excluídas, só desligadas.
- **Seed:** as 6 regras da tela de referência, só se a tabela estiver vazia. Nascem desligadas
  "Etiquetar tarefas de UM" e "Avisar quem criou quando concluir" (esta repete o `status_changed` do
  N2; decisão do Matheus na M-053).
- **Sem retry:** `automation.evaluate` e `automation.overdue` são enviados com `retryLimit: 0`
  (`NO_RETRY` em `src/server/jobs.ts`, opção do job, vale também para filas já criadas). Repetir o job
  repetiria as ações que já rodaram; uma falha de infraestrutura no meio perde o resto daquele job
  (M-053).
- **Templates:** de tarefa (título com `{UM}`, prioridade, etiquetas, subtarefas, descrição, prazo em
  dias úteis) e de projeto (lista de tarefas com os mesmos campos). Usar pede Projeto/Cliente e UM
  (opcional) e cria tudo numa transação só; template de projeto cria várias tarefas, não cria cadastro
  (decisão do Matheus). Membros criam, editam e usam; arquivar em vez de excluir (`archived_at`,
  coluna nova). Tela em `/templates`.
- **Migração `0011`** só aditiva: `automation_rules`, `automation_runs`, valor `automation` no enum
  `notification_event`, `templates.archived_at`.

**Alternatives considered**
- Avaliar regras na própria requisição — viola o ADR-010 e o timeout do túnel.
- Condições sobre o payload do evento ("de/para") — mais exato em corridas, mas a tela e o PRD só
  pedem o estado atual; a diferença só aparece se a tarefa mudar de novo antes do worker rodar.
- Template de projeto criando também o cadastro de Projeto/Cliente — mais telas e regras sem pedido.
- Gravar "vencida" na tarefa — duplica o que o prazo já diz.

**Consequences**
Uma escrita que é gatilho insere um job a mais na transação. Regras mal configuradas param em 3
níveis e ficam visíveis em `automation_runs`. Ações novas são um caso a mais no executor e no Zod.

## ADR-053 — Ciclos, marcos e painel: regras de planejamento (Módulo 10)

**Status:** Accepted
**Date:** 2026-10-17
**Module:** 10 — Ciclos, marcos e painel

**Context**
O PRD (P1–P3, V3–V5) e o FLOWS §7 pedem ciclos com um ativo por vez, encerramento que leva as
pendências, marcos com progresso e um painel por Projeto/Cliente. O schema (`cycles`, `milestones`,
`tasks.cycle_id`, `tasks.milestone_id`) existe desde o Módulo 04 (ADR-042). Faltava fixar quem
planeja, o que acontece sem próximo ciclo e como medir o painel.

**Decision**
- **Quem:** `admin` e `member` (tabela de Papéis do CLAUDE.md), tudo pelo `planningService` com
  `Actor`. Ciclos e marcos não são excluídos: ciclo termina `closed`, marco é concluído (`closed_at`) e
  pode ser reaberto.
- **Ciclo:** número sequencial (`max + 1`), início e fim obrigatórios (fim ≥ início); datas editáveis
  enquanto não encerrado. Iniciar só sem outro ativo (o índice `cycles_one_active_uq` é a defesa).
- **Encerrar:** exige um ciclo `planned` (o de menor número é o "próximo"); sem ele, o service recusa
  com "Crie o próximo ciclo antes de encerrar". A tela lista as tarefas não concluídas e não
  arquivadas, todas marcadas; as marcadas vão para o próximo ciclo, as desmarcadas ficam sem ciclo.
  Tudo numa transação, com `field_changed` (`field: "cycle"`) por tarefa. O próximo não é iniciado
  automaticamente.
- **Tarefa:** `cycleId` e `milestoneId` entram em criar, alterar e na ação em massa (V3, "mudar
  ciclo"). Não aceita ciclo encerrado nem marco concluído; o marco precisa ser de um dos
  Projetos/Clientes da tarefa. Filtro `ciclo` nas visões (V5) e `G C` abre o ciclo ativo.
- **MCP:** `cycle: 'current' | number` passa a valer (fim do `VALIDATION` da M-044); `'current'` sem
  ciclo ativo → `NOT_FOUND`.
- **Marco:** nome, descrição, Projeto/Cliente e prazo opcional; progresso = concluídas ÷ tarefas não
  arquivadas ligadas. Aparece no calendário (V4) no dia do prazo.
- **Painel** (`/painel?projeto=…&dias=30`): abertas, concluídas no período, vencidas (abertas com
  prazo < hoje), tempo médio até concluir (`completed_at − created_at` das concluídas no período),
  concluídas por semana (12 semanas), abertas por status e por UM. "Do projeto" = qualquer vínculo em
  `task_projects` (ADR-045). Gráficos com o Chart do shadcn (Recharts 3.10.1), cores por token.
- **Sem migração:** as tabelas e colunas já existem.

**Alternatives considered**
- Criar o próximo ciclo automaticamente ao encerrar — inventa datas sem pedido.
- Deixar as pendências no ciclo encerrado — some do quadro do ciclo ativo sem ninguém ver.
- Só admin planeja — contraria a tabela de Papéis.

**Consequences**
Encerrar pede um ciclo planejado antes. O painel faz agregações na hora; com o volume de 4 pessoas
não precisa de cache.

---

## ADR-054 — PWA com service worker próprio e telas mobile (Módulo 11; altera o ADR-016)

**Status:** Accepted
**Date:** 2026-10-18
**Module:** 11 — PWA, mobile e acabamento

**Context**
O ADR-016 escolheu o Serwist (`@serwist/turbopack`) e deixou o service worker manual em
`public/sw.js` como alternativa. O `@serwist/turbopack` 9.5.13 traz `@swc/core` (binário nativo),
`@serwist/build` e um passo de build com esbuild só para gerar um worker que, no escopo do MVP
(shell e última lista vista, sem edição offline), cabe em ~70 linhas. O worker de push do Módulo 08
(`public/push-sw.js`) já é manual.

**Decision**
- **Service worker manual em `public/sw.js`** (escopo `/`), registrado pelo shell em toda tela; ele
  absorve o push do `push-sw.js`, que sai. Registrar `/sw.js` no mesmo escopo atualiza a
  registration antiga, e a assinatura de push continua valendo.
- **Cache:** navegação (HTML) em rede primeiro, guardando a última resposta 200 de cada URL;
  sem rede → a mesma URL do cache → `/` do cache → página "Sem conexão" simples. `/_next/static`,
  `/icons`, `/brand`, `/splash` e fontes em cache primeiro. Nunca passa pelo cache: não-GET,
  `/api`, `/mcp`, `/login` e as requisições RSC (cabeçalho `RSC`). Versão do cache no nome; o
  `activate` apaga as antigas. **Sair apaga os caches** (HTML tem dados da pessoa).
- **Offline na tela** (UI.md §3): faixa "Sem conexão — mostrando a última versão salva" e o
  conteúdo dentro de `<fieldset disabled>`, que desabilita todo botão e campo sem tocar em cada
  componente; links continuam navegando para o que estiver em cache.
- **Manifest** em `src/app/manifest.ts` (do `docs/brand/manifest.webmanifest`); atalhos "Criar
  tarefa" → `/?criar=1` (abre a criação rápida) e "Minhas tarefas" → `/` (as rotas `/tarefas/nova`
  e `/minhas` do pacote não existem). `theme-color` por tema no `viewport`; splash iOS pelo
  `appleWebApp.startupImage`.
- **Prompt de instalação:** só abaixo de 768 px e fora do modo instalado; Android/Chrome usa o
  `beforeinstallprompt`, iOS mostra "Compartilhar › Adicionar à Tela de Início". "Agora não" grava
  no `localStorage` do aparelho e o banner não volta.
- **Mobile (< 768 px):** barra inferior Minhas, Tarefas, Criar, Ciclo, Mais; "Mais" lista as outras
  telas da navegação, tema, atalhos e Sair. Kanban uma coluna por vez com `scroll-snap`; criação
  rápida como painel inferior; detalhe em tela cheia (o detalhe já é rota própria).

**Alternatives considered**
- `@serwist/turbopack` (ADR-016) — dependência nativa e passo de build para pouco código.
- Cache das respostas RSC — a navegação do cliente cai em navegação completa quando a rede falha,
  e o HTML em cache já atende; cachear RSC duplica o conteúdo por URL.
- Desabilitar escrita componente a componente — muitos pontos de toque para o mesmo efeito do
  `fieldset`.

**Consequences**
Sem precache: uma tela só abre offline se já foi vista online naquele aparelho. Atualizar o
worker é trocar `CACHE_VERSION` em `public/sw.js`, o que também zera o `static-*` (que só cresce
até lá). Se o escopo offline crescer (edição offline), reavaliar o Serwist.

Exceção à regra "nunca hex em componente": os hex da página "Sem conexão" do `public/sw.js` e do
`viewport.themeColor` em `src/app/layout.tsx` ficam fora do CSS (o worker não carrega os tokens; o
`theme-color` é meta do navegador) e repetem `--bg-base`, `--text-base` e o fundo do escuro.

---

## ADR-055 — E2E no CI (Módulo 11; complementa o ADR-029)

**Status:** Accepted
**Date:** 2026-10-18
**Module:** 11 — PWA, mobile e acabamento

**Context**
O E2E ficou fora do CI desde a M-007, por precisar de banco semeado e servidor rodando. No Módulo 11
a suíte passou a entrar uma vez (`tests/e2e/auth.setup.ts`) e a rodar contra o build de produção.
O Matheus pediu o E2E no CI agora (M-066).

**Decision**
- Job `e2e` no `ci.yml`, em paralelo ao Quality Check, com Postgres 18.6 de serviço e banco próprio
  `itc_tasks_e2e` (o `itc_tasks_test` continua só para a integração).
- Passos: `npm ci`, `db:migrate`, `db:seed`, `next build`, `next start -p 3000` em segundo plano,
  espera do `/api/health`, `npx playwright install --with-deps chromium` e `npx playwright test`.
  `BETTER_AUTH_URL` e `E2E_BASE_URL` em `http://localhost:3000`.
- **Credenciais do seed geradas a cada execução:** e-mail fixo de teste (`e2e@itcbr.test`) e senha
  `openssl rand` mascarada (`::add-mask::`) e passada por `$GITHUB_ENV`. Nada em arquivo nem em
  secret, porque o banco morre com o job.
- Falhou → `playwright-report/` e `test-results/` (traces) como artefato por 7 dias, com
  `actions/upload-artifact` fixada por SHA.
- Worker pg-boss (`npm run worker:build`, `node dist/worker.mjs`) junto do servidor: ele cria o
  schema `pgboss`, de que dependem o `/api/health` e as escritas (fila na transação, ADR-050).

**Alternatives considered**
- Secret do repositório com a senha do seed — mais um segredo para girar, sem ganho num banco
  descartável.
- Passo no Quality Check — somaria build e navegador ao caminho crítico e misturaria os bancos.
- `node .next/standalone/server.js` — exige copiar `public/` e `.next/static/` como o Dockerfile;
  o `next start` serve o mesmo build para o teste.

**Consequences**
O CI fica mais longo, mas roda em paralelo ao Quality Check. Os logs do servidor e do worker
entram no artefato quando o job falha.

## ADR-056 — Importação do Windshift: silenciosa e idempotente (Módulo 12)

**Status:** Accepted
**Date:** 2026-10-18
**Module:** 12 — Migração e implantação

**Context**
As tarefas abertas do Windshift (15, sem as Epics) entram uma vez no ITC Tasks já em produção
(M-071, simplificada na M-085). O `record()` enfileira `fanout` (ADR-050) e `evaluate` (ADR-052)
para todo evento: importar pelo caminho normal mandaria avisos, push e e-mail aos responsáveis
e dispararia automações sobre tarefas antigas. Rodar o script duas vezes também não pode duplicar.

**Decision**
- **Silêncio por opção explícita:** `record(tx, actor, taskId, events, { silent: true })` e
  `insertTask(tx, actor, data, { silent: true })` não enfileiram `fanout` nem `evaluate`. O
  `pg_notify` (SSE, ADR-048) continua: ele só atualiza telas abertas, não avisa ninguém. Nenhum
  outro chamador passa a opção; o padrão continua barulhento.
- **Histórico:** ator `system` e, além do `created`, um evento `imported`
  (`{ source: "windshift", sourceId, key }`), mostrado como "importou do Windshift (TI-30)".
- **Origem guardada:** tabela `task_imports (task_id, source, source_id, imported_at)`, com
  `task_id` único e único em `(source, source_id)`, em migração aditiva (`0012_task_imports`).
  A segunda execução pula o que já entrou e informa quantas pulou.
- **Um comando, sem planilhas:** `node dist/import-windshift.mjs <pasta> [--dry-run]`, empacotado
  pelo esbuild como o worker. Mapeamento explícito no código (`src/server/services/windshift-import.ts`):
  - Projeto/Cliente e UM pelos rótulos dos campos personalizados, que já são as siglas e os
    códigos do seed; os únicos apelidos são `ITCBrasil → ITC` e `Mobility → MOBILITY`. Sem projeto → `ACL`.
  - Status por nome: `Backlog → backlog`, `Open → todo`, `In Progress`/`Aguardando → in_progress`
    (primeiro status ativo da categoria). `Done` e categoria concluída ficam fora.
  - Prioridade pelo `builtin_key` (`critical → urgent`, `high`, `medium`, `low`).
  - Responsável pelo e-mail, só membro ativo; não encontrado vira "sem responsável" e entra no
    relatório, sem bloquear.
  - Epics não viram tarefa; a filha leva "Epic no Windshift: <título>" na descrição.
  - Descrição em texto vira parágrafos Tiptap, mais "Importada do Windshift — <chave> (ID <id>),
    criada em dd/mm/aaaa".
- **Tudo ou nada:** valida todas as tarefas antes de gravar (rótulo desconhecido, UM fora dos
  projetos da tarefa pelo ADR-045, status sem mapeamento). Com erro, lista linha a linha e não
  grava nada. Sem erro, grava tudo numa transação pelo `insertTask`. `--dry-run` mostra a prévia
  (título, projeto, UM, status, prioridade, responsável) e o relatório, e não grava.

**Alternatives considered**
- Enfileirar e descartar os jobs depois, ou desligar o worker durante a importação: frágil, e o
  worker atende o time ao mesmo tempo.
- Um `if (actor.kind === "system")` dentro do `record()`: esconde a regra, e as automações
  e o seed também usam esse ator.
- As quatro planilhas da M-071: pesadas para 15 tarefas cujos campos já casam com o seed (M-085).

**Consequences**
A importação não aparece em Notificações nem dispara regras. Reimportar é seguro. O ID e a
chave originais ficam no banco e na descrição, para conferência.

## ADR-057 — `--err` do tema escuro em `#e2705f` (complementa o ADR-039)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** pós-Módulo 12 (pendência da M-088; decisão do Matheus na M-093)

**Context**
No escuro, o `--err` `#d75a4a` dá 4,10:1 como texto sobre `bg-surface` (`#1e2422`), abaixo do
4,5:1 do WCAG AA para texto normal. Isso afeta as mensagens de erro (`text-err`) dos diálogos,
cujo corpo é `bg-popover` = `bg-surface`. O axe só pegava o problema com um erro na tela, e
nenhum E2E provocava erro antes de rodar o axe (M-088).

**Decision**
- No tema escuro, `--err` passa de `#d75a4a` para `#e2705f`; o claro (`#c0392b`) não muda.
- Contrastes no escuro, de antes para depois:
  - texto `err` sobre `bg-surface`: 4,10:1 → **5,05:1**;
  - texto `err` sobre `bg-base` (`#141918`): 4,61:1 → **5,68:1**;
  - `on-err` (`#141918`) sobre `err` (botão destrutivo, ADR-039): 4,61:1 → **5,68:1**.
- O `text-muted` do escuro já passa (5,43:1 sobre `bg-surface`, 6,11:1 sobre `bg-base`) e sai da
  pendência.
- O E2E roda o axe nos dois temas também com uma mensagem de erro visível (`tests/e2e/members.spec.ts`).

**Alternatives considered**
- **Separar um token de texto (`err-text`) do de fundo (`err`)**, como o `accent-text` e o
  `accent-solid`. Descartada: um tom só passa nos dois papéis (texto e fundo com `on-err`), e um
  token a mais seria um caminho paralelo que os componentes teriam de escolher certo.
- **Deixar o erro em negrito ou maior:** 4,10:1 só vale para texto grande (≥ 18,66 px em negrito),
  e a mensagem de erro é texto normal.

**Consequences**
No escuro, tudo que usa `err` fica um pouco mais claro e quente:
- mensagens de erro e o `alert` dos formulários;
- botão destrutivo (`bg-err` com `on-err`);
- borda e anel de campo inválido (`destructive`) e itens destrutivos de menu;
- ícone de prioridade "Urgente";
- relógio de atraso no card e borda de atraso no calendário.

Sobre `bg-muted` (`#2a302e`), o `err` novo dá 4,30:1: hoje nenhum texto de erro fica nesse fundo.
Se um dia ficar, é preciso conferir de novo.

## ADR-058 — Superfície HTTP do Better Auth por lista de permissão (Módulo 13)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 13 — Auditoria de segurança (issues #18 e #27, achados A01 e A15)

**Context**
`src/app/api/auth/[...all]/route.ts` expõe todos os endpoints do Better Auth e dos plugins
`admin` e `apiKey`. Três deles contornam regras dos services:
- `POST /api/auth/api-key/update` deixa o dono gravar `enabled: true`, e isso reativa um token
  que o admin revogou (ADR-049);
- `/api-key/delete` apaga a linha;
- `/update-user` e `/admin/*` (`remove-user`, `set-role`, `impersonate-user`,
  `set-user-password`) não respeitam o ADR-018, o `assertNotSelf` nem o limite do nome, e não
  gravam evento.

A UI chama pelo cliente só `signIn.email` e `signOut`. Todo o resto passa pelos services, que usam
`auth.api.*` direto, sem passar pela rota HTTP.

**Decision**
- O `route.ts` responde 404 a qualquer caminho fora da lista `/sign-in/email`, `/sign-out` e
  `/get-session`. A lista fica no próprio arquivo, com um comentário que remete a este ADR.
- Endpoint novo de plugin começa fechado. Para abrir um, é preciso mudar a lista, com ADR.

**Alternatives considered**
- **`disabledPaths` do Better Auth (lista de bloqueio):** descartada. Cada plugin novo, ou cada
  atualização que traga endpoint novo, nasce aberto.
- **Coluna própria de revogação conferida no `agentFromKey`:** resolve só o A01 e pede migração.
  O `/admin/*` e o `/update-user` continuariam abertos.

**Consequences**
- O cliente não acessa mais `authClient.admin.*`, `authClient.apiKey.*` nem `updateUser`. Ninguém
  usava.
- Rotas OAuth, magic link e semelhantes, se um dia entrarem, precisam ser adicionadas à lista.
- O teste de integração confere 404 em `/api-key/update` e 200 no fluxo de login.

## ADR-059 — Cabeçalhos de segurança estáticos no `next.config.ts` (Módulo 13)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 13 — Auditoria de segurança (issue #19, achados A02 e A08)

**Context**
O app não envia nenhum cabeçalho de segurança. A `docs/ARCHITECTURE.md:117` dizia que enviava. O
Next 16 com `cacheComponents` e `partialPrefetching` entrega cascas estáticas e scripts inline de
hidratação. A CSP com nonce exige renderização dinâmica de toda página, pelo `proxy.ts`.

**Decision**
`headers()` em `next.config.ts`, para `/:path*`:
- `Content-Security-Policy`:
  - `default-src 'self'`;
  - `script-src 'self' 'unsafe-inline'`, mais `'unsafe-eval'` só em desenvolvimento;
  - `style-src 'self' 'unsafe-inline'`, porque o Tiptap, o Recharts e o next-themes usam estilo
    inline;
  - `img-src 'self' data: blob:`, `font-src 'self'` e `connect-src 'self'` (SSE e Server Actions);
  - `worker-src 'self'` e `manifest-src 'self'`;
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` e `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e
  `Referrer-Policy: strict-origin-when-cross-origin`.
- `Cross-Origin-Opener-Policy: same-origin`. Uma aba aberta para outro site fica sem
  `window.opener`, e isso fecha o reverse tabnabbing do editor (A08) sem mudar o clique no link.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `Strict-Transport-Security: max-age=31536000`, só em produção (o dev é http).

**Alternatives considered**
- **CSP com nonce pelo `proxy.ts`:** descartada por agora. Ela força renderização dinâmica,
  desliga o cache de cascas (`cacheComponents`) e o cache de telas do service worker (ADR-054).
  Fica como evolução: com nonce, o `'unsafe-inline'` sai do `script-src`.
- **Cabeçalhos no Cloudflare (Transform Rules):** descartada. Ficariam fora do repositório, sem
  revisão nem teste, e não valeriam no dev nem no E2E.
- **`openOnClick: false` no Link do Tiptap, para o A08:** descartada. Muda o comportamento visível
  do editor, e o COOP resolve sem essa mudança.

**Consequences**
- O `'unsafe-inline'` em `script-src` não bloqueia um XSS que injete script inline. A CSP vale
  sobretudo por `frame-ancestors`, `object-src`, `base-uri`, `form-action` e `connect-src`, que
  impede mandar dados para fora.
- Integração nova com outro domínio (fonte, CDN, analytics) exige ajustar a CSP.
- O E2E completo roda com os cabeçalhos ligados.

## ADR-060 — Web Push só para hosts de push service conhecidos (Módulo 13)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 13 — Auditoria de segurança (issue #23, achados A05 e A16)

**Context**
O `pushSubscriptionSchema` aceita qualquer `https://`. O worker e o `/api/push/test` fazem POST a
esses endereços a partir do `glpi-srv`. Isso é SSRF cego, com a resposta 2xx servindo de oráculo.
Não há limite de assinaturas por pessoa. O upsert por `endpoint` também troca o dono da assinatura.

**Decision**
- O host do endpoint tem de ser `fcm.googleapis.com` (Chrome, Edge Android), `web.push.apple.com`
  (Safari, iOS), `*.push.services.mozilla.com` (Firefox) ou `*.notify.windows.com` (Edge
  Windows). A checagem é feita no Zod, com `new URL().hostname`.
- No máximo 10 assinaturas por pessoa. Uma inscrição nova acima do limite apaga a mais antiga da
  mesma pessoa, em vez de recusar. Assim, quem troca muito de navegador não fica sem push.
- Se o `endpoint` já pertence a outra pessoa, a assinatura não muda de dono (409).
- O `/api/push/test` aceita no máximo 5 envios por minuto por pessoa, com contador em memória
  (uma réplica, como o rate limit do Better Auth). Acima disso, responde 429.

**Alternatives considered**
- **Bloquear IPs privados resolvendo o DNS antes do POST:** descartada. Fica sujeito a DNS
  rebinding e a IPv6 mapeado, e dá mais código do que uma lista de 4 domínios estáveis.
- **Recusar acima do limite:** descartada. A pessoa teria de limpar assinaturas antigas, e não há
  tela para isso.

**Consequences**
- Navegador com push service fora da lista não consegue se inscrever, e a tela mostra o erro de
  assinatura inválida. Os 4 domínios cobrem Chrome, Edge, Firefox e Safari.
- Assinatura antiga com outro host continua no banco e falha em silêncio, como uma expirada.
  Hoje não existe nenhuma assim.

## ADR-061 — Documento Tiptap normalizado no servidor (Módulo 13)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 13 — Auditoria de segurança (issue #20, achado A09)

**Context**
`descriptionJson` e `commentBodySchema` aceitam qualquer objeto com `type: "doc"` (`.loose()`).
Se a Server Action for chamada direto, ela aceita uma marca `link` com `class`, `target` e `rel`
arbitrários, por exemplo um overlay de tela inteira com classes Tailwind. Aceita também uma menção
com `label` que não bate com a pessoa do `id`, e um documento sem limite de tamanho.

**Decision**
Um `transform` no Zod (`src/lib/validation/tasks.ts`) percorre o documento e:
- na marca `link`, guarda só `href`; `target`, `rel` e `class` voltam aos padrões do Tiptap no
  render;
- remove `class` e `style` dos `attrs` de qualquer nó ou marca;
- recusa documento com mais de 200 000 caracteres em JSON ou mais de 20 níveis de profundidade.

Os services de comentário e de tarefa regravam o `label` de cada menção com o nome atual da pessoa
no banco.

**Alternatives considered**
- **Validar contra o schema do ProseMirror no servidor (`getSchema(StarterKit)` +
  `Node.fromJSON`):** descartada. O servidor passaria a carregar o Tiptap. O `fromJSON` também
  aceita os `attrs` declarados pela extensão, e `class`/`rel` estão entre eles.
- **Sanitizar só no render:** descartada. O JSON gravado continuaria sujo, e o MCP o devolve aos
  agentes.

**Consequences**
- O link colado mantém `href`. O `target="_blank"` e o `rel` vêm dos padrões do Link.
- O nome da pessoa mencionada passa a refletir o banco na hora da gravação.

## ADR-062 — Troca da própria senha pelo service, com rastro no log (Módulo 14)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 14 — Ajustes pós-auditoria (M-117, issue #22)

**Context**
A senha do admin do seed vazou para o `auth.log` e o journal do `glpi-srv` (#22). O app não
permitia trocar a própria senha: `resetMemberPassword` recusa a si mesmo e o ADR-058 fechou
`/api/auth/change-password`.

**Decision**
`changeOwnPassword(actor, { current, next, confirm }, keepSessionId)` em
`src/server/services/members.ts`, chamado pela Server Action `changeMyPasswordAction` (cartão
"Senha" em Minhas preferências). Só ator `user`; agente recebe `ForbiddenError`. Confere a senha
atual com `ctx.password.verify` do Better Auth, valida a nova com o `passwordSchema`, grava com
`ctx.password.hash` (Argon2id, como o `resetMemberPassword`) e, na mesma transação, apaga as
sessões da pessoa exceto a da requisição. O rastro é uma linha no log do servidor
(`[auth] senha trocada userId=… actor=user`), sem a senha.

**Alternatives considered**
- **Reabrir `/change-password` na allowlist:** descartada pela M-117; o endpoint também aceita
  `revokeOtherSessions` opcional, e a regra ficaria fora do service (ADR-003).
- **Tabela de auditoria nova:** descartada por ora. `task_events` é só de tarefa e não há outro
  evento de conta; uma tabela para um único tipo de evento é cedo. Volta à mesa se o item 2
  (exclusão de tarefa) criar uma tabela de rastro.

**Consequences**
- Qualquer pessoa troca a própria senha sem o admin; as outras sessões (e os SSE abertos, pelo
  `stillSignedIn`) caem na hora.
- O rastro dura o quanto durar o log do container.

## ADR-063 — Exclusão definitiva de tarefa, com rastro em `task_deletions` (Módulo 14)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 14 — Ajustes pós-auditoria (M-117 item 2)

**Context**
O Matheus decidiu permitir excluir tarefas de verdade e aceita perder o histórico da tarefa
excluída. Até aqui só havia arquivamento, e `task_events` era só-inserção sem exceção. Todas as
FKs para `tasks` já são `ON DELETE CASCADE` (checklist, vínculos, projetos, UMs, etiquetas,
comentários, eventos, anexos, notificações, `task_imports`); `automation_runs` é `SET NULL`.

**Decision**
- `deleteTasks(actor, taskIds)` em `src/server/services/tasks.ts`, numa transação, tudo ou nada.
  Só ator `user`: admin exclui qualquer uma; member só as que criou (`creatorId` = ele e
  `createdVia` `user` ou `agent`, então a criada pelo agente dele conta como dele). Criada por
  automação, importação ou sistema: só admin. Agente nunca exclui, e o MCP não tem ferramenta.
- Antes de apagar, grava uma linha por tarefa na tabela nova `task_deletions` (`number`, `title`,
  `deleted_by`, `deleted_at`), sem FK para `tasks`. O `DELETE` em `tasks` leva os dependentes
  pelo cascade, inclusive os eventos dessa tarefa. Esta é a única exceção à regra
  "`task_events` é só-inserção".
- Os arquivos dos anexos saem do volume depois do commit (falha em um arquivo só gera log; a
  linha já não existe).
- O `pg_notify('task_changed')` sai na mesma transação com `fields: ["deleted"]`. Quem está com a
  tarefa aberta recarrega e cai no 404. Os jobs pendentes (`fanout`, `evaluate`) já ignoram
  eventos e tarefas que não existem mais.
- O número vem da sequência `task_number_seq` e não volta: `TI-<n>` excluído fica sem dono, e
  `/tarefas/<n>` dá 404.

**Alternatives considered**
- **Rastro só no log do servidor:** descartada. O log do container some com a rotação e não dá
  para consultar quem excluiu o quê.
- **Exclusão lógica (`deletedAt`):** descartada. O Matheus pediu exclusão de verdade, e o
  arquivamento já cobre o caso de esconder.
- **Manter `task_events` e trocar a FK para `SET NULL`:** descartada. Exigiria reescrever uma FK,
  e as migrações são só aditivas.

**Consequences**
- Excluir não tem volta. Sem backup (INFRA §9), a tarefa só sobrevive na linha de
  `task_deletions`.
- Migração `0013_task_deletions`, só aditiva.

## ADR-064 — Cache de telas do service worker limitado à validade da sessão (Módulo 14; altera o ADR-054)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 14 — Ajustes pós-auditoria (A20, #33, M-127)

**Context**
O ADR-054 guarda no cache `pages-v1` o HTML autenticado de cada tela e só o apaga no "Sair". Se a
sessão expira sem logout, as telas continuam no aparelho: num aparelho compartilhado, quem abrir o
app offline vê os dados da pessoa anterior. O `res.redirected` só impedia gravar o redirect para
o `/login`, sem apagar o que já estava salvo. A sessão do Better Auth usa o padrão (`expiresIn`
7 dias, renovada a cada dia de uso); `src/server/auth.ts` não muda esses valores.

**Decision**
- **Sessão expirada, online:** navegação que volta com 401 ou redirecionada apaga todo cache
  `pages-*`. A navegação usa `redirect: "manual"`, e o SW recebe `opaqueredirect`, sem o destino;
  todo redirect do app hoje vai ao `/login` (`proxy.ts` e `requireActor`). Um redirect novo para
  outra tela também limparia o cache, o que só custa a cópia offline.
- **Prazo:** a cópia gravada leva o cabeçalho `x-sw-cached-at` (ms). No fallback offline, tela com
  mais de 7 dias (a validade da sessão) é apagada e ignorada; sem outra tela válida, vale a página
  "Sem conexão". Offline nunca mostra tela que já não abriria online.
- **Troca de pessoa:** o "Sair" já apaga. Sem "Sair" (sessão expirada), o login com sucesso também
  apaga (`clearPageCache` no `login-form.tsx`), porque quem abre `/login` direto não passa pelo SW.
- `CACHE_VERSION` sobe para `v2`; o `activate` descarta o `pages-v1` antigo, sem data.

**Alternatives considered**
- **Só limpar no redirect para `/login`:** descartada sozinha. Offline o SW não sabe se a sessão
  expirou, e o vazamento é justamente offline.
- **Não guardar HTML (só o shell):** descartada. Tira o que o ADR-054 promete (última versão vista
  de cada tela offline).
- **Prazo menor que a sessão (ex.: 1 dia):** descartada. Esconderia telas que ainda abririam
  online, sem ganho: a sessão continua valendo no cookie.

**Consequences**
- Se a validade da sessão mudar no `auth.ts`, o `MAX_AGE` do `public/sw.js` precisa acompanhar.
- O prazo conta da última gravação da tela, não do último uso da sessão; com sessão renovada, a
  tela é regravada a cada abertura online.

## ADR-065 — Página de ajuda `/ajuda` em TSX, ilustrada com os componentes reais (Módulo 14)

**Status:** Accepted
**Date:** 2026-10-19
**Module:** 14 — Ajustes pós-auditoria (item 5, M-131)

**Context**
O manual de uso aprovado no Claude Design (artboard "Manual do ITC Tasks") precisa virar uma página
do app, consultada logada e no tema de cada pessoa. O manual usa capturas das telas de 17/10, que já
divergem do código (exclusão, senha, atalhos, barra inferior).

**Decision**
- Rota `/ajuda` no grupo `(app)`: qualquer papel logado (admin e member), sem rota pública.
- Conteúdo em TSX versionado com o código, em `src/app/(app)/ajuda/`, uma seção por componente em
  `sections/`. **Sem dependência nova** (sem MDX).
- **Sem capturas de tela.** As ilustrações usam os componentes do Design System (StatusIcon,
  PriorityIcon, ProjectChip, UnitChip, GlpiChip, TaskCard, Card, `kbd`) com dados de exemplo fixos;
  nada vem do banco. Quando a interface muda, a ajuda muda junto.
- 13 seções com `id` estável para âncora (`primeiro-acesso` … `papeis`); sumário com âncoras em
  coluna à esquerda a partir de 1024 px e em lista no topo abaixo disso.
- O endereço do MCP vem de `BETTER_AUTH_URL` (`${BETTER_AUTH_URL}/mcp`), não fixo; a tela de Agentes
  e MCP passa a usar o mesmo valor. O token aparece só como o marcador `itct_SEU_TOKEN`.
- Os clientes MCP (Claude Code, Claude Desktop, Hermes Agent) saem de uma lista de dados; cliente
  novo é mais um item, com âncora `mcp-<id>`.
- A tabela de atalhos da ajuda mostra só os atalhos implementados (`SHORTCUTS` de `shortcuts.tsx`),
  sem reabrir o UI.md §5.
- Pontos de entrada: "Ajuda" no menu do usuário (que também é o "Mais" do celular), "Abrir ajuda" no
  ⌘K, "Manual completo" no diálogo de atalhos (`/ajuda#atalhos`) e "Como conectar um agente" em
  Agentes e MCP (`/ajuda#mcp`).
- Fora do escopo: busca dentro da ajuda e "?" contextual nas telas.

**Alternatives considered**
- **MDX:** descartada. Dependência e configuração novas para 13 seções que precisam de componentes
  React de qualquer jeito.
- **Capturas de tela:** descartada. Envelhecem a cada mudança de interface e não seguem o tema.
- **Rota pública:** descartada. A ajuda descreve telas internas e não precisa estar fora do login.
- **Embutir o artifact do Design:** descartada. Fica fora do tema e do controle de versão do app.

**Consequences**
- Texto da ajuda muda junto com a funcionalidade, no mesmo PR; a ajuda pode ficar desatualizada se
  ninguém lembrar dela, como qualquer documentação.
- Atalho novo entra em `SHORTCUTS` e aparece sozinho no diálogo e na ajuda.

---

## ADR-066 — Exceção à regra de migrações só aditivas: `model`, `plate` e `base` saem de `mobile_units` (Módulo 15)

**Status:** Accepted
**Date:** 2026-11-12
**Module:** 15 — Ajustes de produto (item 1)

**Context**
`mobile_units` tem `model`, `plate` e `base` desde o Módulo 03. As carretas são Unidades Móveis de
Atendimento e os caminhões não são responsabilidade do time de TI: os três campos estão fora do
escopo e nunca foram preenchidos (todas as UMs ativas aparecem com "—" em produção). A regra do
projeto é migração só aditiva, porque não há backup definido (`docs/INFRA.md` §9).

**Decision**
- Decisão do Matheus: remover os três campos da tela, do Zod, do service, do MCP e **do banco**.
- A exceção à regra vale **só** para as colunas `model`, `plate` e `base` de `mobile_units`. A regra
  continua para todo o resto.
- Salvaguarda: a migração confere, num bloco `DO $$ … $$`, que as três colunas estão nulas ou vazias
  em **todas** as linhas (ativas e arquivadas). Havendo qualquer valor, `RAISE EXCEPTION`: a migração
  falha, a transação é desfeita e o deploy não segue. Só depois vem o `DROP COLUMN`.

**Alternatives considered**
- **Só esconder na interface e manter as colunas:** descartada pelo Matheus. Coluna morta no schema
  confunde quem lê e continuaria exposta por engano em consulta nova.
- **`DROP` sem conferência:** descartada. Sem backup, um valor digitado entre a decisão e o deploy
  se perderia sem aviso.

**Consequences**
- `list_mobile_units` do MCP deixa de devolver `model`, `plate` e `base` (eram opcionais).
- Se alguém preencher um dos campos antes do deploy, a migração aborta e o deploy para; resolve-se
  limpando o valor à mão, depois de decidir o que fazer com ele.
- Não há caminho de volta para os dados (não havia dado).

---

## ADR-067 — Quinta categoria de status: `waiting` ("Aguardando") (Módulo 15; complementa o ADR-022)

**Status:** Accepted
**Date:** 2026-11-12
**Module:** 15 — Ajustes de produto (item 2)

**Context**
O ADR-022 fixou quatro categorias (`backlog`, `todo`, `in_progress`, `done`). Falta um lugar para a
tarefa iniciada e parada por algo fora do alcance da equipe: compra a caminho, fornecedor que não
enviou o equipamento, retorno de terceiro. Hoje ela fica em "Em andamento" e se confunde com o que
está de fato sendo feito.

**Decision**
- Nova categoria fixa `waiting`, rótulo **"Aguardando"**, na ordem Backlog · A fazer · Em andamento ·
  **Aguardando** · Concluído. No enum: `ALTER TYPE status_category ADD VALUE 'waiting' BEFORE 'done'`.
- Novo status "Aguardando" (categoria `waiting`) no seed. Em banco já semeado, um passo idempotente
  **depois** das migrações (`scripts/migrate.mjs`, no start do container, e `npm run db:seed`) cria
  o status se não houver nenhum da categoria, logo antes do primeiro status `done` (os status
  dessa posição em diante descem uma casa).
  - O `INSERT` não fica no arquivo `.sql`: o Postgres não deixa usar um valor novo de enum na mesma
    transação do `ADD VALUE`, e o migrator do Drizzle aplica todas as migrações pendentes numa
    transação só.
- `waiting` conta como **aberta** em tudo: painel, contadores, filtros, lembretes, MCP. O código já
  trata "aberta" como "categoria diferente de `done`", então nada muda nessas consultas. Tarefa
  aguardando com prazo vencido continua atrasada. Automações que dependem de `done` não disparam.
- `completed_at` segue a regra do ADR-022: só `done` preenche.
- Ícone: `Hourglass` do `lucide-react` (16 px, `strokeWidth={1.75}`) no `StatusIcon`, cor `warn`. É
  cor funcional em estado, e só no ícone: o rótulo "Aguardando" fica em `text-base`, porque `warn`
  nunca é texto no tema claro. A forma (ampulheta) diferencia a categoria sem depender da cor.
- Aparece sem código próprio onde a lista de status vem do banco (colunas do Kanban, filtros,
  seletor de status) e por lista fixa em Configurações › Workflow, Automações, MCP (`category` do
  `list_tasks`) e ajuda.

**Alternatives considered**
- **Etiqueta "aguardando":** descartada. Não vira coluna no Kanban e some nos filtros por status.
- **Status "Aguardando" dentro de `in_progress`:** descartada. Painel e MCP agrupam por categoria e
  não distinguiriam o que está parado por terceiro.
- **Cor `info` ou `muted` no ícone:** descartada. `info` já é "Em andamento" e `muted` é Backlog e
  A fazer; `warn` comunica "parado, pede atenção".
- **`INSERT` do status num arquivo de migração separado:** descartada. Falha pelo mesmo motivo (mesma
  transação) quando as duas migrações chegam juntas, que é o caso do deploy.

**Consequences**
- Cada categoria precisa de um status ativo (regra existente); `waiting` passa a contar nela.
- A importação do Windshift mapeava "Aguardando" para `in_progress`; já foi aplicada e não muda.
- Depois do pull, em desenvolvimento: `npm run db:migrate` e `npm run db:seed` (o seed cria o
  status). Em produção o entrypoint faz os dois passos.

---

## ADR-068 — Cor por Projeto/Cliente: paleta fechada de 8 cores no Chip, UM no tom mais suave (Módulo 15)

**Status:** Accepted
**Date:** 2026-11-12
**Module:** 15 — Ajustes de produto (item 3)

**Context**
No TaskCard o chip de Projeto/Cliente mostra "ITC · ITC Brasil" e ocupa a linha inteira; todos os
projetos têm o mesmo ciano, e a UM é um chip neutro sem ligação visual com o projeto a que pertence.
O Matheus pediu só a sigla no card e uma cor por projeto, com a UM num tom mais claro da mesma cor
(BSBIA em azul, BSBIA02 em azul claro). A regra "nunca hex em componente" continua valendo.

**Decision**
- **Só a sigla** no chip compacto (TaskCard no Kanban e em Minhas tarefas, Lista). O nome completo
  vai no `title` (tooltip) e num texto só para leitor de tela dentro do chip ("ITC · ITC Brasil").
  Não uso `aria-label`: num `span` sem papel o axe o trata como atributo proibido. No detalhe da
  tarefa, nos seletores e em Marcos o chip continua com o nome (`full`).
- **Paleta fechada de 8 cores**, por chave: `blue`, `indigo`, `violet`, `magenta`, `rose`, `brown`,
  `olive`, `slate`. Sem verde, laranja, vermelho e amarelo (são `ok`, `warn`, `err`, `sev-medium`)
  e sem ciano (é o `accent`, o chip padrão). O azul fica mais claro e menos saturado que o `info` e
  só aparece como fundo de chip, nunca como ícone de estado.
- Três tokens por cor em `src/styles/globals.css`, no claro e no escuro, expostos no `@theme`:
  `--project-<cor>-bg` (fundo do chip de projeto), `--project-<cor>-unit-bg` (fundo do chip de UM)
  e `--project-<cor>-fg` (texto e ícone dos dois). O chip de UM usa o **mesmo texto** do projeto:
  sobre o fundo mais suave o contraste só aumenta.
  - No claro o fundo da UM é mais claro que o do projeto; no escuro é mais próximo da superfície.
    Nos dois temas a UM é a versão mais suave da cor do projeto.
- Coluna aditiva `projects.color` (`text`, nula) com a **chave** da paleta, validada por
  `z.enum(PROJECT_COLORS)`. Nula = chip ciano atual (`accent-light` + `accent-text`) e UM neutra:
  nada muda até alguém escolher.
- O admin escolhe em Configurações › Projetos/Clientes: grupo de amostras (rádio) com o nome da cor
  em português como rótulo acessível, mais "Padrão". A lista de projetos mostra o chip na cor.
- O chip de UM herda a cor do projeto da UM. Tarefa com vários projetos (ADR-045): um chip por
  projeto, cada um com a sua cor.
- Variante no próprio Chip: `ProjectChip` e `UnitChip` ganham a prop `color`. Sem componente novo.
- O MCP devolve `color` em `list_projects` (leitura). Escrita de cor só pela tela.

**Contraste (WCAG AA 4,5:1), texto `fg` sobre cada fundo**

| Cor | Claro: projeto / UM | Escuro: projeto / UM |
|---|---|---|
| `blue` | 7,70 / 9,42 | 7,40 / 9,60 |
| `indigo` | 9,31 / 12,16 | 7,80 / 8,98 |
| `violet` | 8,64 / 10,94 | 7,68 / 9,28 |
| `magenta` | 7,56 / 9,21 | 7,36 / 9,55 |
| `rose` | 7,66 / 9,53 | 7,35 / 9,39 |
| `brown` | 6,94 / 8,16 | 7,26 / 9,97 |
| `olive` | 5,36 / 5,80 | 6,65 / 10,61 |
| `slate` | 7,35 / 8,70 | 7,33 / 9,94 |

**Alternatives considered**
- **Hex livre por projeto (seletor de cor):** descartada. Quebra a regra dos tokens e não garante
  contraste nos dois temas.
- **Reusar a paleta de etiquetas (ADR-041):** descartada. Aqueles tokens são cores de ponto sobre
  fundo neutro, não pares fundo/texto, e projeto e etiqueta com a mesma cor se confundiriam.
- **Texto próprio para o chip de UM (quarto token):** descartada. O mesmo `fg` passa com folga.
- **`aria-label` no chip:** descartada (axe `aria-prohibited-attr` em `span` sem papel).
- **Cor na UM, independente do projeto:** descartada. A hierarquia UM → projeto é o que se quer ver.

**Consequences**
- O artefato do Design System (referência no CLAUDE.md) precisa ganhar a paleta e a variante do Chip;
  quem atualiza é o Cowork.
- Com mais de 8 projetos ativos as cores se repetem; a sigla continua sendo o identificador.
- Cor nova na paleta = três tokens em cada tema, a chave em `PROJECT_COLORS` e a linha na tabela.

---

## ADR-069 — Tarefas pessoais: `tasks.visibility` e um único escopo de leitura, `visibleTo(actor)` (Módulo 15)

**Status:** Accepted
**Date:** 2026-11-12
**Module:** 15 — Ajustes de produto (item 5)

**Context**
O time quer anotar tarefas que só quem criou enxerga, fora da rotina da equipe, sem perder checklist,
comentários, anexos, prazo e calendário. Até aqui toda tarefa é visível a todos os membros e todos
os caminhos de leitura partem dessa premissa (vários nem recebem o `Actor`).

**Decision** (decisões de produto aprovadas pelo Matheus no prompt do módulo)
- **Modelo:** coluna `tasks.visibility` (`task_visibility`: `team` | `personal`, padrão `team`).
  Não é tabela nova. Migração aditiva.
- **Dono:** quem criou (`creator_id`). Só o dono vê e edita. **Nem o admin** vê tarefa pessoal de
  outra pessoa. O agente (MCP) age em nome do dono do token: lê e escreve as pessoais do dono e
  nunca as de outra pessoa; continua sem excluir.
- **Uma regra de leitura:** `visibleTo(actor)` em `src/server/services/tasks.ts` devolve a condição
  SQL `visibility = 'team' OR creator_id = <pessoa do ator>` (automação e sistema: só `team`).
  - Consultas de visão usam `visibleTo`; as da equipe (Kanban, Lista, Calendário, painel, ciclos,
    marcos) somam `visibility = 'team'`, para a pessoal não aparecer nem para o dono.
  - Leituras por id (comentários, histórico, anexos, detalhe) e **toda** escrita passam por
    `lockTask(tx, id, actor)` ou `assertVisible(actor, id)`, que aplicam a mesma condição e respondem
    `NOT_FOUND` (a tela dá 404), sem dizer que a tarefa existe.
  - O filtro fica no service. A UI só deixa de mostrar o que o service já não devolve.
- **Fora da rotina:** tarefa pessoal não tem ciclo nem marco, não conta no painel, não dispara
  automação e não notifica outra pessoa (menção numa pessoal não avisa ninguém). O dono ainda
  recebe os lembretes de prazo e os avisos do próprio agente. O SSE leva o dono no evento e
  `/api/events` só o repassa à sessão dele.
- **Responsável:** sempre o dono. Garantido no service e por `CHECK` no banco.
- **Projeto/Cliente opcional na pessoal:** exceção à regra "Projeto/Cliente obrigatório", que segue
  valendo para a equipe no banco (`project_id` deixa de ser `NOT NULL` e ganha
  `CHECK (visibility = 'personal' OR project_id IS NOT NULL)`), no Zod e no service.
- **Número e URL:** mesma sequência `TI-<n>` e `/tarefas/<n>`. O número pode pular para os outros.
- **Status:** mesmo workflow da equipe.
- **Conversão:** pessoal → equipe pelo dono (exige Projeto/Cliente; grava `field_changed` com
  `field: "visibility"`). Equipe → pessoal **não existe**, para nenhuma tarefa da equipe sumir.
  Depois da conversão, o histórico e os comentários do período pessoal ficam visíveis à equipe.
- **Vínculos:** o alvo de um vínculo precisa ser visível a quem vincula, e o detalhe só lista
  vínculos com tarefas que o leitor vê.
- **Exclusão:** o dono exclui as próprias (ADR-063). Em `task_deletions` o título de uma pessoal é
  gravado como "(tarefa pessoal)", para o rastro não guardar o conteúdo.
- **MCP:** `create_task` ganha `visibility` (padrão `team`); `list_tasks` ganha `visibility`
  (`team` padrão, `personal`, `all`); `update_task` aceita `visibility: "team"` para converter.

**Alternatives considered**
- **Tabela `personal_tasks`:** descartada. Duplicaria checklist, comentários, anexos, calendário e
  as visões.
- **Filtro na UI ou por tela:** descartada. Um caminho esquecido (busca, MCP, SSE, anexo pela URL)
  vazaria; o risco fica numa função só, coberta por teste em cada caminho.
- **Row Level Security do Postgres:** descartada por ora. O app usa um papel só e um pool sem
  contexto de sessão; exigiria `SET LOCAL` em toda transação. Pode vir depois como segunda camada.
- **Admin vê tudo:** descartada pelo Matheus. A tarefa pessoal é da pessoa, não da operação.
- **Sequência de número separada:** descartada. Conversão para a equipe trocaria o número e a URL.
- **Conversão equipe → pessoal:** descartada. Seria um jeito de esconder trabalho da equipe.

**Consequences**
- Função nova que lê tarefa precisa usar `visibleTo`, `lockTask` ou `assertVisible`; o teste de
  integração `personal-tasks.test.ts` cobre cada caminho com dono, outro membro, admin e agentes.
- `tasks.project_id` passa a aceitar nulo no tipo; o código que supunha projeto trata a ausência.
- Quem tem acesso direto ao banco ou ao backup continua vendo tudo: a garantia é do aplicativo.
- A regra "Projeto/Cliente obrigatório" do CLAUDE.md passa a valer para tarefas da equipe.

## ADR-070 — Deploy só depois do CI verde na `main` (`workflow_run`)

**Status:** Accepted
**Date:** 2026-11-12
**Module:** Pós-15 — infraestrutura

**Context**
O `deploy.yml` disparava em `push` na `main`, em paralelo ao CI. No merge do PR #40 (`97dc45f`),
o CI #121 falhou no E2E e o deploy publicou do mesmo jeito: nada impedia um commit vermelho de ir
para produção. Branch protection exige plano pago (INFRA §11, M-112).

**Decision**
O `deploy.yml` passa a disparar por `workflow_run` do workflow `CI` (`types: [completed]`,
`branches: [main]`) e o job só roda com `conclusion == 'success'` e `event == 'push'`. O
`workflow_dispatch` continua para deploy manual (que não passa pelo CI; uso consciente).

**Alternatives considered**
- *Deploy como job do `ci.yml` com `needs:` e `if: github.ref == 'refs/heads/main'`:* rejeitado.
  Misturaria os secrets de produção no workflow que também roda em `pull_request` e tiraria o
  `concurrency` e as `permissions: {}` próprios do deploy.
- *Branch protection com checks exigidos:* exige GitHub Team (recusado em M-112).

**Consequences**
- Merge com CI vermelho não publica; corrige-se na `develop` e um novo merge publica.
- O deploy começa ~6 min depois do merge (tempo do CI).
- O servidor faz `git pull` da `main` atual (comando forçado da chave), não do SHA testado. Se
  houver dois merges seguidos, o primeiro deploy pode publicar o segundo commit antes do CI dele
  terminar. Risco aceito pelo Cowork e pelo Matheus (M-148, 12/11/2026): só pesa com dois merges muito
  próximos; merges na `main` são raros e manuais, e o deploy do segundo roda depois.
- `workflow_run` só vale com o `deploy.yml` na branch padrão (`main`): passa a valer no próximo merge.

## ADR-071 — Excluir ciclos e marcos (só admin; tarefas ficam e perdem o vínculo)

**Status:** Accepted
**Date:** 2026-11-17
**Module:** 16 — Ajustes de uso (item 3)

**Context**
Ciclos e marcos criados por engano ou de teste não tinham como sair: o ADR-053 só previa encerrar
o ciclo e concluir o marco. A regra "cadastros nunca são excluídos" (ADR-018) vale para Projetos/
Clientes, UMs, Workflow, Etiquetas e Envolvidos, que outras telas e o MCP referenciam por nome. Ciclo
e marco **não são cadastros**: são planejamento, com vida curta, e o único vínculo forte é
`tasks.cycle_id`/`tasks.milestone_id`.

**Decision**
- `deleteCycle(actor, id)` e `deleteMilestone(actor, id)` em `src/server/services/planning.ts`. Só
  `user` com papel `admin` exclui; agente (mesmo de admin), automação e sistema são recusados.
- Numa transação: cada tarefa ligada (de qualquer estado, inclusive concluída ou arquivada) é
  travada com `lockTask`, perde o vínculo (`cycle_id`/`milestone_id = null`) e grava
  `field_changed` `{ field: "cycle" | "milestone", from, to: null, deleted: "<nome>" }`, lido no
  histórico como "removeu do Ciclo N, que foi excluído". Depois a linha do ciclo/marco é apagada.
- O nome vai no payload porque o id deixa de existir e o histórico não conseguiria mais resolvê-lo.
- Rastro da exclusão: o evento em cada tarefa e uma linha `[planning] ciclo excluído …` no log do
  processo, como a troca de senha (ADR-062). **Sem tabela nova** como o `task_deletions` (ADR-063):
  um ciclo ou marco sem tarefas não tem o que preservar além do número/nome, e a migração só
  acrescentaria escrita. Se o Matheus quiser auditoria consultável, vira item próprio.
- Confirmação na UI com o número de tarefas afetadas.

**Alternatives considered**
- *Arquivar (`archivedAt`) em vez de excluir:* rejeitado. O pedido é tirar o ciclo/marco de vista e
  das tarefas; arquivar deixaria o vínculo e exigiria filtrar em todas as leituras.
- *Recusar a exclusão com tarefas ligadas:* rejeitado pelo Matheus no prompt do Módulo 16.
- *Tabela `planning_deletions`:* adiada (acima).

**Consequences**
- Números de ciclo não são reaproveitados enquanto houver um maior (`max + 1`); excluir o último
  libera o número dele.
- As tarefas perdem a referência; o histórico conta o que aconteceu.
