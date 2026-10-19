# Módulo 14 — Ajustes pós-auditoria

Módulo adicional (M-117, 19/10/2026), na `feat/14-ajustes` a partir da `develop`. Dois itens, em
PRs separados: o 1 sai primeiro porque o merge publica em produção.

## Item 1 — Trocar a própria senha (ADR-062)

- **Onde:** Minhas preferências › cartão "Senha" (`PasswordForm` em
  `src/app/(app)/config/preferencias/preferences-client.tsx`). Senha atual, nova e confirmação.
- **Validação:** `changePasswordSchema` em `src/lib/validation/members.ts` (nova = `passwordSchema`,
  12 a 128 caracteres; confirmação igual).
- **Service:** `changeOwnPassword` em `src/server/services/members.ts`. Só ator `user`; senha atual
  errada → `MemberError("Senha atual incorreta")`. Hash Argon2id do Better Auth; apaga as outras
  sessões e mantém a da requisição (o id vem do `auth.api.getSession` na action).
- **Rastro:** linha `[auth] senha trocada userId=… actor=user` no log do servidor.
- **MCP:** sem ferramenta. A allowlist do ADR-058 não muda.
- **Testes:** `tests/integration/change-password.test.ts` (senha atual errada, fraca, confirmação
  diferente e agente recusados; outras sessões caem, a atual fica; senha antiga 401, nova 200) e
  `tests/e2e/members.spec.ts` (erro de senha atual na tela, axe nos dois temas).

**Limite de tentativas (M-119):** 5 erros de senha atual por pessoa em 15 min; a 6ª tentativa,
mesmo com a senha certa, recebe "Muitas tentativas". Contagem em memória do processo (um container
só); reiniciar o app zera.

**Depois do merge:** o Matheus troca a senha do admin em Minhas preferências (#22). Aprovado na
M-119; PR #30 `develop → main`.

## Item 2 — Excluir tarefa

ADR-063. Muda a regra "`task_events` é só-inserção" só para este caso (CLAUDE.md e `SCHEMA.md`
atualizados).

- **Quem pode:** `canDeleteTask` em `src/server/permissions.ts` (puro, usado pelo service e pela UI).
  Admin exclui qualquer uma; member só as que criou (`creatorId` dele e `createdVia` `user` ou
  `agent`). Criada por automação, importação ou sistema: só admin. Agente nunca; o MCP não tem
  ferramenta.
- **Service:** `deleteTasks(actor, { taskIds })` em `src/server/services/tasks.ts`, tudo ou nada
  (até 200). Trava as tarefas, confere cada uma, grava o rastro, emite `task_changed` com
  `fields: ["deleted"]` e apaga; o cascade leva checklist, vínculos, projetos, UMs, etiquetas,
  comentários, eventos, anexos, avisos e `task_imports`. Os arquivos saem do volume depois do
  commit (`removeStoredFiles`).
- **Rastro:** tabela `task_deletions` (`number`, `title`, `deleted_by`, `deleted_at`), sem FK para
  `tasks`. Migração `0013_task_deletions`, só aditiva.
- **Número:** vem do `task_number_seq` e não volta. `/tarefas/<n>` excluída mostra o 404 (com
  status 200, porque o `Suspense` já começou a enviar a página).
- **Quem está com a tarefa aberta:** o SSE recarrega a tela, que cai no 404. Os jobs pendentes
  (`fanout`, `evaluate`) já ignoram eventos e tarefas que não existem.
- **UI:** `DeleteTasksDialog` (`src/components/tasks/delete-tasks-dialog.tsx`) com `TI-<n>` e
  título de cada tarefa. Botão "Excluir" no rodapé do cartão de propriedades do detalhe (volta
  para a Lista) e na barra de ações em massa da Lista, que só aparece se a pessoa pode excluir
  todas as selecionadas.
- **Testes:** `tests/integration/delete-task.test.ts` (member que não criou, agente e lote misto
  recusados; tarefa do sistema só admin; a do agente conta como do dono; dependentes, arquivo e
  rota somem; rastro gravado; número não volta; admin exclui a de outro) e
  `tests/e2e/delete.spec.ts` (detalhe com axe nos dois temas e 404; Lista em massa). O
  `createTask` dos E2E foi para `tests/e2e/session.ts`.

**Depois do pull:** `npm run db:migrate` (`0013_task_deletions`).

## Item 3 — Ações de Membros num menu (M-122)

- **Por quê:** com 4 botões por linha, a tabela de Membros passava da largura do card e criava
  rolagem horizontal mesmo em tela larga.
- **UI:** `MemberActions` em `src/app/(app)/config/membros/members-client.tsx`. Botão de ícone
  `MoreHorizontal` (`aria-label="Ações de <nome>"`) com "Editar nome", "Redefinir senha" e, por
  último e destrutivo, "Desativar/Reativar". Na linha "(você)": "Editar nome" e "Trocar senha",
  que leva a `/config/preferencias#h-password`. Os diálogos de nome e senha viraram controlados e
  abrem a partir do menu.
- **Largura:** sem rolagem horizontal a partir de 1024 px (conferido em 1024 e 1280); abaixo
  disso o `overflow-x-auto` continua.
- **Testes:** `tests/e2e/members.spec.ts` (editar nome, redefinir senha, desativar e reativar pelo
  menu; axe nos dois temas na tabela e nos diálogos; `scrollWidth <= clientWidth` da região em
  1280 px; menu da linha "(você)"). Axe com o menu aberto acusa `region` (o portal do Base UI fica
  fora dos landmarks), por isso roda antes de abrir o menu.

## Item 4 — Cache de telas do service worker e sessão expirada (A20, #33, M-127)

- **Por quê:** o `pages-v1` guardava o HTML autenticado de cada tela e só saía no "Sair". Com a
  sessão expirada, quem abrisse o app offline no mesmo aparelho via as telas da pessoa anterior.
- **Decisão:** ADR-064 (altera o ADR-054). Em `public/sw.js`: navegação com 401 ou redirect
  (`opaqueredirect`, todo redirect do app vai ao `/login`) apaga os caches `pages-*`; cada cópia
  leva `x-sw-cached-at`, e o fallback offline apaga e ignora tela com mais de 7 dias (validade
  padrão da sessão do Better Auth); `CACHE_VERSION` `v2`. O login com sucesso também chama
  `clearPageCache` (`login-form.tsx`), para a troca de pessoa sem "Sair".
- **Testes:** `tests/e2e/sw-cache.spec.ts` (offline abre do cache; cookie apagado, online → `/login`
  e cache vazio; tela com data de 8 dias, offline → "Sem conexão" com axe; "Sair" limpa, só no
  desktop e com sessão própria, para não derrubar a do `storageState`).
- **Observação:** a página aberta do cache offline não mostra a faixa "Sem conexão — mostrando a
  última versão salva" logo de início; o `mobile.spec.ts` cobre a faixa quando a rede cai com a
  tela aberta. Não mudou com este item.

## Item 5 — Página de ajuda `/ajuda` (M-131, ADR-065)

- **Por quê:** o manual de uso aprovado no Claude Design (artboard "Manual do ITC Tasks") vira uma
  página do app, consultada logada e no tema de cada pessoa.
- **Decisão:** ADR-065. `src/app/(app)/ajuda/`: `page.tsx` (capa em `accent-dark`, sumário com
  âncoras à esquerda a partir de 1024 px e no topo abaixo disso), `sections.tsx` (as 13 seções, uma
  função por seção, `id` estáveis) e `code-block.tsx` (bloco que rola dentro da caixa, "Copiar" com
  toast). Sem dependência nova, sem capturas: StatusIcon, PriorityIcon, ProjectChip, UnitChip,
  GlpiChip, TaskCard, Card e `Kbd` com dados fixos.
- **MCP:** endereço `MCP_URL` = `${BETTER_AUTH_URL}/mcp` (`src/lib/env.ts`), também na tela de Agentes
  e MCP, que antes fixava `tasks.itcbr.xyz`. Bloco comum (token, endereço, cabeçalho, 9 ferramentas,
  regras) e clientes por lista de dados (`CLIENTS`): Claude Code (`#mcp-claude-code`, `claude mcp add
  --transport http … --header` e `.mcp.json`), Claude Desktop (`#mcp-claude-desktop`, conector
  personalizado com "Request headers"; sem essa seção, o conector remoto só aceita OAuth e o texto
  manda usar o Claude Code) e Hermes Agent (`#mcp-hermes`, `mcp_servers` com `url` e `headers`,
  `/reload-mcp` ou reiniciar, filtro `tools.include`/`tools.exclude` citado). Marcador
  `itct_SEU_TOKEN`.
- **Texto conferido contra o código:** atalhos só os implementados (lista `SHORTCUTS`, agora em
  `shortcut-list.ts` para o servidor ler; saíram `G M`, `G T`, `G N`, `V K/L/C`, `J/K`, `Enter` e `X`,
  que estão no UI.md §5 mas não no código); ações em massa da Lista com prioridade e "Excluir" só
  quando dá para excluir todas; senha com bloqueio de 15 min após 5 erros; sem "Manter conectado"
  (não existe na tela Entrar); barra inferior Minhas, Tarefas, Criar, Ciclo e Mais; ⌘K sem "Alternar
  tema" (não existe); push só no expediente e e-mail só no resumo das 08:00 (ADR-050/051), com os
  padrões por evento.
- **Pontos de entrada:** "Ajuda" (`CircleHelp`) no menu do usuário, que é também o "Mais" do
  celular; "Abrir ajuda" no ⌘K; "Manual completo" no diálogo de atalhos (`/ajuda#atalhos`); "Como
  conectar um agente" em Agentes e MCP (`/ajuda#mcp`).
- **Testes:** `tests/e2e/help.spec.ts`: menu do usuário (desktop e Mais no celular) e ⌘K; axe nos
  dois temas; âncoras `#mcp` e `#mcp-hermes`; link da tela de Agentes; "Copiar" com toast e conteúdo
  na área de transferência; `scrollWidth <= clientWidth` em 390 e 1280 px; membro criado na hora
  entra e abre `/ajuda`.
- **Fora do escopo:** busca dentro da ajuda e "?" contextual nas telas.

## Item 6 — Atalhos do UI.md §5 (M-136)

- **Por quê:** a `/ajuda` (item 5) mostrou que parte do UI.md §5 não existia no código. Decisão do
  Matheus em 19/10/2026: implementar os de navegação e de visão, tirar os da lista.
- **O que mudou:** `useGoTo` (`shortcuts.tsx`) aceita outra tecla de prefixo e handler nulo
  (desligado), e guarda o handler num ref. No `app-shell.tsx`: `G` `M`, `G` `T`, `G` `C` e `G` `N`;
  `V` `K`/`L`/`C` só nas três visões de Tarefas, com `window.location.search` (os filtros continuam).
  Os sete entram em `SHORTCUTS` (diálogo `?` e `/ajuda#atalhos`); a ajuda cita o `V` na seção Visões.
- **Fora:** `J`/`K`, `Enter` e `X` saíram do UI.md §5 (foco de linha ativa e acessibilidade); podem
  voltar como item próprio. Sem ADR.
- **Testes:** `tests/e2e/shortcuts.spec.ts` (desktop): cada `G`; `V` `L`, `V` `C` e `V` `K` com
  `?prioridade=high` preservado; digitar `gtvk` no campo da ⌘K não navega.

## Item 7 — Painel com "Todos os Projetos/Clientes" (M-139)

- **Por quê:** pedido do Matheus em 19/10/2026; sem `?projeto=` o `/painel` caía no primeiro projeto.
- **O que mudou:** primeira opção do filtro é "Todos os Projetos/Clientes", e é o padrão (sem
  `?projeto=` ou com um id que não existe). Escolher "Todos" tira o `projeto` da URL e mantém `dias`.
  `projectDashboard(actor, { projectId?, days })`: sem `projectId`, o escopo são os projetos de
  `listProjects(actor)` (ativos). O filtro é `tasks.id IN (SELECT task_id FROM task_projects …)`,
  então tarefa com vários vínculos conta uma vez em todos os números. Na visão "Todos" há a barra
  "Abertas por Projeto/Cliente" (código); nela a tarefa com dois vínculos entra nas duas.
- **Acesso:** `listProjects` não filtra por pessoa (todos veem todos os projetos ativos); o escopo
  do "Todos" é esse. Projeto arquivado fica de fora.
- **Fora:** MCP não expõe o painel. Sem ADR, sem migração.
- **Testes:** `tests/integration/planning.test.ts` (tarefa em dois projetos conta 1 nos indicadores
  e 1 em cada barra; projeto arquivado fora; com projeto escolhido não há barra por projeto);
  `tests/e2e/planning.spec.ts` (abre em "Todos", `?projeto=` some e volta mantendo `dias=7`).
