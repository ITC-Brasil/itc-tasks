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

> Alterado pelo ADR-033 (audit só de produção; Gitleaks por imagem). O Postgres local de desenvolvimento usa a porta `5435` (o NoteScan local usa `5434`).

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
