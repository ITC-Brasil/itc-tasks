# Módulo 15 — Ajustes de produto

Cinco itens pedidos pelo Matheus em `PROMPT_MODULO_15.md`, feitos em 12/11/2026 numa sessão sem
supervisão, na `feat/15-ajustes-produto` (merge na `develop` ao fim de cada item).

## Decisões a confirmar

Decididas sem o Matheus, pela opção mais conservadora. **Aprovação (M-144, 12/11/2026):** o
Matheus aceitou o ícone `Hourglass` em `warn` (só no ícone) para Aguardando, a paleta de 8 cores de
projeto, a aba Menções só com tarefas da equipe e o modo Cards agrupado por prazo. A atualização do
artefato do Design System (paleta e variante `color` do Chip) fica com o Cowork. As demais seguem
como registradas abaixo.

- **Item 1 — rótulos do formulário de UM:** "UM" e "Projeto" também no diálogo de criar e editar. A
  mensagem de validação continua "Escolha o Projeto/Cliente da Unidade Móvel".
- **Item 1 — banco de teste local:** o `itc_tasks_test` da máquina do Matheus tinha 5 UMs com
  `model` preenchido por testes antigos; os valores foram zerados à mão para a migração passar. O
  banco de desenvolvimento e o do CI não tinham dado.
- **Item 2 — ícone e cor do Aguardando:** `Hourglass` do lucide em `warn`, só no ícone (o nome do
  status fica em `text-base`). Alternativa: `CirclePause`, ou cor `info`/`muted`.
- **Item 2 — onde o status é criado:** não no arquivo `.sql`, e sim num passo idempotente depois das
  migrações (`scripts/migrate.mjs` e seed). O prompt pedia o `INSERT` na migração; o Postgres não
  deixa usar o valor novo do enum na transação do `ADD VALUE`, e o Drizzle aplica as migrações
  pendentes numa transação só. O passo põe "Aguardando" antes do primeiro status `done` e desce uma
  posição os status dali em diante (muda só a ordem).
- **Item 2 — importação do Windshift:** o mapa "Aguardando" → `in_progress` ficou como está (a
  importação já foi aplicada).
- **Item 3 — paleta de projeto:** 8 cores (`blue` Azul, `indigo` Anil, `violet` Violeta, `magenta`
  Magenta, `rose` Rosa, `brown` Marrom, `olive` Oliva, `slate` Cinza-azulado), geradas por matiz
  com luminosidade fixa; valores e contraste no ADR-068. Sem verde, laranja, vermelho, amarelo e
  ciano. Trocar matizes ou nomes é só mexer nos tokens e em `PROJECT_COLORS`.
- **Item 3 — UM no tema escuro:** o "tom mais claro" vira "tom mais suave": no escuro o fundo da UM
  é mais próximo da superfície, não mais claro.
- **Item 3 — artefato do Design System:** a paleta de projeto e a variante `color` do Chip precisam
  entrar no artefato (https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495). Fica com o Cowork.
- **Item 3 — onde a sigla sozinha vale:** TaskCard (Kanban e Minhas tarefas), Lista e a lista de
  Configurações › Projetos/Clientes. Detalhe, seletores e Marcos seguem com o nome. O Calendário não
  mostra chip de projeto e ficou como está.
- **Item 3 — nome acessível:** texto `sr-only` em vez de `aria-label` (o axe proíbe `aria-label`
  em `span` sem papel).
- **Item 3 — MCP:** `color` só em `list_projects`. `TaskSummary.projects` continua lista de siglas.
- **Item 4 — quem recebe o lembrete da subtarefa:** o responsável pela **tarefa** (como pedido),
  não o responsável pelo item. Sem responsável na tarefa, ninguém é avisado.
- **Item 4 — eventos de notificação:** reaproveitei `due_today` e `overdue` (mesmas preferências),
  com `data.subtask` no aviso, em vez de criar tipos novos no enum. O aviso da tarefa e o de cada
  subtarefa são independentes.
- **Item 4 — MCP:** `checklistDue: [{ index, dueDate }]` no `update_task`, no mesmo formato do
  `checklistToggle`. `create_task` continua recebendo só os textos do checklist.
- **Item 4 — seletor de data:** o prazo da tarefa é um `<input type="date">` nativo; a subtarefa
  usa o mesmo, em tamanho menor, sempre visível na linha.
- **Item 4 — sem ADR:** nenhuma decisão com alternativa razoável além das listadas aqui.
- **Item 5 — aba Menções:** continua só com tarefas da equipe (como era). Menção numa tarefa
  pessoal não notifica ninguém, então não há o que listar.
- **Item 5 — aba padrão:** "Minhas tarefas" = tarefas com você como responsável, pessoais ou da
  equipe. A pessoal é sempre atribuída ao criador, então todas as suas pessoais abertas entram.
- **Item 5 — modo Cards:** manteve o agrupamento por prazo (Vencidas, Hoje, Esta semana, Depois)
  com TaskCard, não um quadro por status. `V` `K` leva a Cards. Se a ideia era um Kanban com
  arraste dentro de Minhas tarefas, é um item novo.
- **Item 5 — Cards e Lista só com abertas; Calendário com tudo:** as concluídas aparecem riscadas
  só no Calendário.
- **Item 5 — última visão:** as preferências não guardam visão por pessoa; ficou só a URL.
- **Item 5 — tarefa pessoal no detalhe:** Responsável, Ciclo e Marco somem (não se aplicam).
  "Mover para a equipe" sem Projeto/Cliente mostra o erro e a pessoa escolhe o projeto no próprio
  detalhe antes de tentar de novo; não há diálogo próprio.
- **Item 5 — depois da conversão:** comentários, anexos e histórico do período pessoal ficam
  visíveis à equipe. A ajuda avisa.
- **Item 5 — vínculos:** dá para vincular uma tarefa pessoal a uma da equipe; quem não vê a
  pessoal não vê o vínculo.
- **Item 5 — rastro de exclusão:** `task_deletions.title` de uma pessoal é "(tarefa pessoal)".
- **Item 5 — `CHECK` extra no banco:** além do `CHECK` do projeto, `tasks_personal_owner_ck`
  garante responsável = criador e sem ciclo nem marco na pessoal. Não estava no prompt.
- **Item 5 — `project_id` deixou de ser `NOT NULL`:** é o que o `CHECK` pedido exige. Não remove
  dado, mas afrouxa uma restrição; conta como aditiva.
- **Item 5 — seção da ajuda:** entrou como 14ª seção (`#pessoais`), no fim, para não renumerar as
  outras.
- **Item 5 — lembretes:** o dono recebe os lembretes das 08:00 e o resumo das próprias pessoais.
- **Item 5 — Row Level Security:** não adotado (ADR-069). A garantia é do aplicativo; quem acessa
  o banco direto vê tudo.

## Item 1 — Unidades Móveis sem Modelo, Placa e Base (ADR-066)

- **Tela:** Configurações › Unidades Móveis (`src/app/(app)/config/unidades/units-client.tsx`).
  Colunas: UM, Projeto, Situação. Formulário: UM e Projeto.
- **Validação e service:** `mobileUnitSchema` (`src/lib/validation/catalog.ts`) só com `code` e
  `projectId`; `listMobileUnits` não devolve mais os três campos.
- **MCP:** `list_mobile_units` devolve `{ code, project? }`.
- **Banco:** `drizzle/0014_mobile_unit_drop_fields.sql`. Um bloco `DO $$` levanta exceção se qualquer
  UM (ativa ou arquivada) tiver `model`, `plate` ou `base` com valor; só depois os três `DROP COLUMN`.
  Única exceção à regra de migrações só aditivas.
- **Testes:** `tests/integration/db.test.ts` roda o arquivo real da migração sobre uma tabela
  temporária (recusa com dado, remove com tudo vazio); `tests/e2e/catalog.spec.ts` confere os
  cabeçalhos e que os campos sumiram.

## Item 2 — Status e categoria "Aguardando" (ADR-067)

- **Banco:** `drizzle/0015_waiting_status_category.sql` (`ALTER TYPE status_category ADD VALUE
  'waiting' BEFORE 'done'`). O status "Aguardando" nasce no seed (banco novo) ou no passo
  idempotente de `scripts/migrate.mjs` e `src/db/seed.mjs` (banco já semeado).
- **Validação:** `STATUS_CATEGORIES` em `src/lib/validation/catalog.ts`; o filtro `category` do
  `list_tasks` (MCP) usa a mesma lista.
- **Services:** sem mudança. "Aberta" já era "categoria diferente de `done`" (painel, lembretes das
  08:00, automações, MCP `overdue`), e `completed_at` só é preenchido em `done`.
- **UI:** `StatusIcon` (`src/components/tasks/badges.tsx`) com a ampulheta; o Kanban, os filtros e o
  seletor de status leem os status do banco e ganham a coluna e a opção sozinhos; Configurações ›
  Workflow e Automações pela lista `CATEGORIES`; ajuda (`/ajuda`, "Como ler um card").
- **Testes:** `tests/integration/planning.test.ts` (aguardando com prazo vencido conta como aberta
  e vencida, `completedAt` nulo); `tests/e2e/views.spec.ts` (move para Aguardando pelo teclado no
  Kanban, axe nos dois temas, status na Lista).
- **Depois do pull (dev):** `npm run db:migrate` e `npm run db:seed`.

## Item 3 — Só a sigla no chip e cor por Projeto/Cliente (ADR-068)

- **Chip:** `ProjectChip` e `UnitChip` em `src/components/tasks/badges.tsx`. Props novas: `full`
  (mostra "SIGLA · Nome") e `color` (chave da paleta). O estilo sai de `var(--project-<cor>-…)`,
  nunca de hex no componente.
- **Tokens:** `src/styles/globals.css`, 3 por cor × 8 cores × 2 temas, expostos no `@theme`.
- **Banco:** `drizzle/0016_project_color.sql` (`projects.color text`, nula). Guarda a chave.
- **Validação:** `PROJECT_COLORS`, `PROJECT_COLOR_NAMES` e `projectSchema.color` em
  `src/lib/validation/catalog.ts`. `""` limpa; ausente não mexe na cor.
- **Service:** `listTasks` e `getTask` devolvem `projects[].color` e `units[].color` (a cor do
  projeto da UM). `TaskRow.units` passou de `string[]` para `{ code, color }[]`. `listMilestones`
  devolve `projectColor`.
- **Tela:** Configurações › Projetos/Clientes (`projects-client.tsx`): grupo de rádios "Cor nos
  cards" com "Padrão" e as 8 amostras, cada rádio com o nome da cor; a coluna Sigla mostra o chip.
- **MCP:** `list_projects` devolve `color`.
- **Testes:** `tests/integration/catalog.test.ts` (hex recusado, vazio limpa, ausente mantém, UM
  herda); `tests/e2e/catalog.spec.ts` (Azul, Rosa e Oliva aplicadas, chip só com a sigla no Kanban,
  axe nos dois temas na lista de projetos e no Kanban).
- **Correção no caminho:** `listMilestones` precisou de `projects.color` no `GROUP BY` (commit
  `fix(planning)`); o E2E pegou, a suíte de integração do commit anterior não tinha sido rodada
  inteira.

## Item 4 — Prazo nas subtarefas

- **Banco:** `drizzle/0017_checklist_due_date.sql` (`checklist_items.due_date date`, nula).
- **Validação e service:** `checklistItemSchema.dueDate` (`src/lib/validation/tasks.ts`);
  `updateChecklistItem` grava `checklist_changed` com `action` `due_set` (e `dueDate`) ou
  `due_cleared`. Prazo depois do prazo da tarefa é aceito. O histórico formata as duas ações
  (`src/server/services/activity.ts`).
- **Tela:** detalhe da tarefa (`task-detail.tsx`): campo de data por subtarefa (`aria-label`
  "Prazo de <texto>", `tabular-nums`). Aberta e vencida: ícone `Calendar` em `err` e "(vencida)"
  para leitor de tela, o mesmo padrão do prazo da tarefa. Concluída não aparece como atrasada.
  `today` vem do servidor (`todayISO()` na página).
- **MCP:** `get_task` → `checklist[].dueDate`; `update_task` → `checklistDue`.
- **Notificações:** `reminders()` em `src/server/services/notifications.ts` inclui as subtarefas
  não concluídas, de tarefas abertas, com prazo hoje ou ontem. Texto: "subtarefa “X” vence hoje em
  TI-n Título" (`src/lib/notifications.ts`). Sem repetir no dia, por subtarefa.
- **Testes:** `tests/integration/tasks.test.ts` (prazo, eventos, data inválida),
  `mcp.test.ts` (`checklistDue`), `notifications.test.ts` (aviso da tarefa e das subtarefas,
  concluída fora, e-mail do resumo); `tests/e2e/tasks.spec.ts` (definir, recarregar, vencida, concluir).

## Item 5 — Tarefas pessoais e nova Minhas tarefas (ADR-069)

- **Banco:** `drizzle/0018_task_visibility.sql`: tipo `task_visibility`, `tasks.visibility`
  (padrão `team`), `project_id` sem `NOT NULL`, `tasks_team_project_ck`,
  `tasks_personal_owner_ck` e o índice parcial `tasks_personal_creator_idx`.
- **Regra de leitura:** `visibleTo(actor)`, `teamOnly`, `assertVisible` e `lockTask(tx, id, actor)`
  em `src/server/services/tasks.ts`.

| Caminho | Onde | Como |
|---|---|---|
| Detalhe `/tarefas/<n>` | `getTaskByNumber` | `visibleTo`; quem não vê recebe 404 |
| Kanban, Lista, Calendário | `listTasks` (padrão) | `visibleTo` + `teamOnly` |
| Minhas tarefas | `listTasks` com `visibility` `all`/`personal` | `visibleTo` |
| Busca ⌘K | `searchTasks` | `visibleTo` |
| Vínculos | `getTaskByNumber`, `linkRow` | `visibleTo` na outra ponta |
| Comentários, histórico, anexos | `listComments`, `listActivity`, `listAttachments` | `assertVisible` |
| Download de anexo | `getAttachment` + `/api/attachments/[id]` | join em `tasks` com `visibleTo` |
| Toda escrita | `lockTask` (tarefa, checklist, vínculo, comentário, anexo, exclusão, mover, em massa) | `visibleTo` |
| Ciclos e marcos | `listCycles`, `pendingTasks`, `cycleLoad`, `closeCycle`, `listMilestones` | `teamOnly` (e `CHECK`) |
| Painel | `projectDashboard` | `teamOnly` |
| Automações | `record` (não enfileira), `snapshot`, `overdue` | `teamOnly` |
| Notificações | `fanout` (só o dono), joins de `listNotifications`, push e resumo | dono |
| SSE | `forSession` em `src/server/realtime.ts`, usado por `/api/events` | `owner` no evento |
| MCP | `taskIdOf`, `getTaskSummary`, `getTaskDetail`, `listTasksForAgent` | `visibleTo` |
| Atividade de agentes | `listAgentActivity` | `visibleTo` |
| Subtarefas no calendário | `listChecklistDue` | `visibleTo` |

  Filtros salvos e templates não guardam dado de tarefa, e o app não tem exportação: nada a
  filtrar neles.
- **Regras de escrita:** pessoal só por pessoa ou agente; responsável sempre o criador; sem ciclo
  nem marco; Projeto/Cliente opcional. `visibility: "team"` no `updateTask` converte (exige
  projeto, grava `field_changed` com `field: "visibility"`). O schema não aceita `"personal"` no
  update.
- **MCP:** `create_task.visibility`, `list_tasks.visibility` (`team` padrão, `personal`, `all`),
  `update_task.visibility: "team"`, `TaskSummary.visibility`.
- **Telas:** criação rápida com "Tarefa pessoal" (`quick-create.tsx`); `PersonalMark` no TaskCard,
  na Lista e no ⌘K; detalhe com o chip, "Mover para a equipe" e sem Responsável, Ciclo e Marco;
  Minhas tarefas (`src/app/(app)/page.tsx`) com 5 abas (`?aba=`) e 3 modos (`?visao=`);
  `MonthCalendar` com `path` e `subtasks`; atalhos `V` `K`/`L`/`C` em Minhas tarefas
  (`app-shell.tsx`, `shortcut-list.ts`); ajuda `#pessoais`.
- **Testes:** `tests/integration/personal-tasks.test.ts` (10 testes: cada caminho de leitura e de
  escrita com dono, outro membro, admin, agente do dono, agente de outra pessoa e sistema; `CHECK`s
  do banco; conversão; exclusão) e `tests/e2e/personal.spec.ts` (criar sem projeto, abas, não
  aparecer na Lista da equipe, Cards/Lista/Calendário e atalhos, 404 para outro membro, mover para
  a equipe, axe nos dois temas).
- **Bug pego pelo teste:** converter para a equipe informando o projeto na mesma chamada batia no
  `CHECK`; o projeto principal agora é gravado junto com a visibilidade.

## Auditoria de segurança (só o que o módulo mudou)

Feita em 12/11/2026, pelas cinco categorias da skill `project-docs`.

| Categoria | Resultado |
|---|---|
| Autorização e vazamento de dados | **Sem achado aberto.** Tarefa pessoal: todos os `from(tasks)`/`join(tasks)` de `src/server` conferidos (tabela do Item 5). Os dois que não usam `visibleTo` são internos: `fanout` (lê a tarefa e entrega só ao dono) e a contagem de tarefas do marco em `saveMilestone` (pessoal não tem marco, por `CHECK`). `removeLink`, `updateChecklistItem`, `removeChecklistItem` e `editComment` não travavam a tarefa; agora passam por `lockTask`. Cor do projeto: só admin escreve (`assertAdmin`). |
| Validação de entrada | **Sem achado.** `visibility` por `z.enum`/`z.literal`; `color` por `z.enum(PROJECT_COLORS)` (hex recusado, com teste); `dueDate` da subtarefa por `z.iso.date`; `checklistDue.index` validado antes de qualquer escrita. |
| Injeção | **Sem achado.** SQL novo só por Drizzle com parâmetros. Os estilos dos chips usam `var(--project-<chave>-…)` com a chave validada pelo enum; nada de valor livre no `style`. Sem `dangerouslySetInnerHTML`. |
| Segredos e configuração | **Sem achado.** Nenhuma variável nova, nenhum segredo em arquivo. `scripts/migrate.mjs` só ganhou um SQL fixo. |
| Dependências e infraestrutura | **Sem achado.** Nenhuma dependência nova. `0014` (o `DROP`): aborta com dado em qualquer UM, ativa ou arquivada; testado com o arquivo real. |

Riscos aceitos e limites:
- A garantia das tarefas pessoais é do aplicativo. Acesso direto ao banco, a um dump ou ao volume
  de anexos mostra tudo.
- O número `TI-<n>` de uma tarefa pessoal é visível por omissão (a sequência pula). Aprovado.
- Quem tem o token de agente de uma pessoa lê as tarefas pessoais dela.
- O service worker guarda a última versão de cada tela no navegador da pessoa (ADR-054, ADR-064);
  num computador compartilhado, o login de outra pessoa limpa o cache.

## Instabilidade no CI do PR #40 (fontes)

O E2E do `pull_request` do PR #40 falhou no `npm run build`, antes de qualquer teste, enquanto o
do `push` do mesmo commit passou: `next/font/google` baixa Inter e Archivo de `fonts.gstatic.com`
durante o build e a requisição falhou ("next/font/google queries have exactly one entry"). A
causa é a dependência de rede no build, que vale também para o build no servidor. Correção: as
duas fontes (subconjunto latin, arquivos variáveis, licença OFL) ficam em `src/app/fonts/` e
`src/app/layout.tsx` usa `next/font/local` com as mesmas variáveis CSS (`--font-inter`,
`--font-archivo`). Os pesos não mudam: Inter 100–900 e Archivo 600–800. Subconjuntos fora do latin não
entram; a UI é só em português.

## Instabilidade no CI #121 (âncoras da ajuda)

O E2E do CI #121 (`97dc45f`, merge do PR #40 na `main`) falhou em `help.spec.ts` "âncoras #mcp e
#mcp-hermes rolam até a seção", só no perfil desktop; a mesma linha passou no mobile e em todos
os runs anteriores. O teste abria `/ajuda#mcp` e logo trocava o hash para `#mcp-hermes`. A troca
só de hash é navegação na mesma página e não espera nada: se a hidratação ainda não terminou, o
roteador do Next rola de volta para a âncora inicial (`#mcp`) depois da troca, e `#mcp-hermes` fica
fora da tela. Correção: `waitForLoadState("networkidle")` antes da segunda navegação. Não é
defeito do app: quem abre o link direto cai na âncora certa. Validado com `--repeat-each=15` no
build de produção local (15/15). A falha do E2E `pull_request` do PR #40 (run #118) era outra: o
download das fontes, seção anterior.

## Fechamento

- **Migrações novas (em ordem):** `0014_mobile_unit_drop_fields`, `0015_waiting_status_category`,
  `0016_project_color`, `0017_checklist_due_date`, `0018_task_visibility`.
  - **`0014` aborta se houver dado** em `model`, `plate` ou `base` de qualquer UM. Em produção as
    colunas estão vazias segundo o Matheus; se a migração falhar no deploy, o container não sobe
    com a versão nova e o valor precisa ser tratado à mão.
  - Depois do pull, em desenvolvimento: `npm run db:migrate` e `npm run db:seed` (o seed cria o
    status "Aguardando"). Em produção o entrypoint faz os dois passos.
- **ADRs:** 066 (UMs), 067 (Aguardando), 068 (cores), 069 (tarefas pessoais).
- **Sem dependência nova.**
- **Histórico de commits, com duas ressalvas:** `a7a5475` (`feat(db): add waiting status category`)
  não passa no typecheck sozinho; o commit seguinte (`b7d6d3c`) completa. `1cd2d9c` deixou
  `listMilestones` quebrada por um commit; `e09ee63` corrige.
- **Ficou de fora:** `StatusBadge` (o componente não existe no código, só o `StatusIcon`); chips de
  projeto no Calendário (ele não mostra chips); preferência de última visão; E2E no perfil mobile
  para o que é novo (os specs novos rodam só no desktop); atualizar o artefato do Design System.
- **Ambiente local nesta sessão:** o Docker Desktop foi iniciado para subir o Postgres; a fila
  `pgboss.job` do banco `itc_tasks_test` foi esvaziada (estava com ~4 mil jobs de execuções
  antigas e estourava o tempo de um teste); as cores Azul, Rosa e Oliva ficaram aplicadas a QMPR,
  BSBIA e SEDET no banco de desenvolvimento pelo E2E.
