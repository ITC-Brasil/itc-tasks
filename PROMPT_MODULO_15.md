# Módulo 15 — Ajustes de produto

UMs, status Aguardando, cores e siglas nos cards, prazo nas subtarefas e Tarefas Pessoais.

Leia `CLAUDE.md`, `docs/PROGRESS.md` e `.conversa/para-claude-code.md` (trate as ABERTAS) antes de começar. Use a skill `project-docs` para toda a documentação. Esta sessão roda **sem supervisão** (o Matheus está dormindo): não pare para perguntar no meio. Quando surgir dúvida de produto que não esteja resolvida abaixo, escolha a opção mais conservadora, registre-a em ADR ou em "Decisões a confirmar" no `docs/modules/15-ajustes-produto.md`, e siga. Só pare ao terminar os cinco itens ou num bloqueio real (CI vermelho que você não consegue corrigir, migração destrutiva além da autorizada no Item 1 etc.). Nesse caso, documente e pare.

## Fluxo de Git

- Branch `feat/15-ajustes-produto` a partir da `develop` atualizada. Merge na `develop` ao fim de cada item (como nos itens do Módulo 14).
- **Um commit por tarefa** (as tarefas numeradas abaixo), `type(scope): descrição`, arquivo por arquivo, sem `git add -A`, conferindo `git status --short`.
- Antes de cada commit: `npm run lint && npm run typecheck && npm test`. Ao fim de cada item, E2E do que mudou contra o build de produção (receita no PROGRESS).
- Ao fim: envie a `develop` ao GitHub, espere o CI verde (Quality Check, E2E, Docker build e Security) e corrija o que falhar.
- **Não abra PR** e não faça merge na `main`: o PR `develop → main` só sai depois do "Módulo 15 aprovado" (regra do CLAUDE.md).
- ADRs a partir do **ADR-066** e mensagens a partir da **M-143**: confira o maior número em `docs/DECISIONS.md` e nos dois arquivos de `.conversa/` antes de escrever.
- Migrações **só aditivas**. A única exceção autorizada é a do Item 1.

---

## Item 1 — Unidades Móveis: remover Modelo, Placa e Base e renomear colunas

Os campos Modelo, Placa e Base não fazem parte do escopo da ITC: as carretas são Unidades Móveis de Atendimento e os caminhões não são responsabilidade do time. Os campos nunca foram usados (todas as UMs ativas aparecem com "—" em produção).

**Decisão do Matheus:** remover os campos também do banco, como **exceção documentada** à regra "migrações só aditivas", restrita a estas três colunas.

1.1 `docs: add ADR for mobile unit fields removal` — ADR que abre a exceção à regra de migrações só aditivas (`docs/INFRA.md` §9) apenas para `model`, `plate` e `base` de UMs (use os nomes reais do `src/db/schema/catalog.ts`). Justificativa: fora do escopo e sem uso. Salvaguarda: a migração aborta se houver dado.
1.2 `refactor(catalog): remove model, plate and base from mobile units` — tirar os três campos da tela (`src/app/(app)/config/unidades/units-client.tsx`), do Zod em `src/lib/validation/`, do service `catalog`, das ferramentas e saídas MCP, do seed, dos chips e tooltips, da ajuda e de qualquer outro uso (busque por `plate`, `placa`, `model`, `base` ligados a UM).
1.3 `feat(db): drop unused mobile unit columns` — migração que **primeiro confere** que as três colunas estão nulas ou vazias em **todas** as UMs, incluindo as arquivadas (bloco `DO $$ … RAISE EXCEPTION …` se houver qualquer valor), e só então faz o `DROP COLUMN`. Se houver dado, a migração falha e o deploy não segue. Atualize `docs/SCHEMA.md`.
1.4 `feat(ui): rename mobile unit table headers` — na tabela de Configurações › Unidades Móveis: **"Código" → "UM"** e **"Cliente" → "Projeto"**. Use os mesmos rótulos no formulário de criar e editar UM.
1.5 `test(catalog): …` — Vitest (inclusive a migração recusando quando há dado, no `itc_tasks_test`) e E2E de UMs.
1.6 `docs: document module 15 item 1` — API.md (se o MCP mudou), UI.md, SCHEMA.md, PROGRESS.

## Item 2 — Status e categoria "Aguardando"

Tarefa iniciada e parada por algo fora do alcance da equipe: compra a caminho, fornecedor que ainda não enviou o equipamento, retorno de terceiro etc.

**Decisões (ADR antes do código; ele complementa o ADR-022, que fixou 4 categorias):**

- Nova categoria fixa `waiting`, rótulo **"Aguardando"**, na ordem: Backlog · A fazer · Em andamento · **Aguardando** · Concluído.
- Novo status "Aguardando" no seed (categoria `waiting`). Em bancos já semeados (produção), crie o status na migração com um `INSERT … WHERE NOT EXISTS`. É aditivo e o rótulo foi aprovado pelo Matheus.
- Conta como **aberta** em tudo que hoje considera aberto (painel, contadores, filtros, MCP). Continua aparecendo como atrasada se passar do prazo. Não dispara as automações que dependem de `done`.
- Ícone próprio no `StatusIcon` e no `StatusBadge` (por exemplo `lucide` `Hourglass` ou `CirclePause`, 16 px, `strokeWidth={1.75}`), com cor de token funcional, permitida por ser estado. Respeite a regra: `warn` e `sev-medium` nunca como texto no tema claro. Confira o contraste nos dois temas com o axe.
- Coluna própria no Kanban, opção nos filtros, no workflow (Configurações › Workflow), no MCP (enum de categorias) e na ajuda.

Tarefas:

2.1 `docs: add ADR for waiting status category`
2.2 `feat(db): add waiting status category` — valor novo no enum (`ALTER TYPE … ADD VALUE`) e o status no banco, com seed atualizado.
2.3 `feat(tasks): support waiting category` — Zod, services (painel, contadores, automações, lembretes) e MCP.
2.4 `feat(ui): waiting status in board and badges` — `StatusIcon`/`StatusBadge`, coluna do Kanban, filtros, Workflow.
2.5 `test(status): …` — Vitest e E2E (mover para Aguardando no Kanban; axe nos dois temas).
2.6 `docs: document module 15 item 2` — SCHEMA, API, FLOWS, UI, PRD, ajuda, PROGRESS.

## Item 3 — Cards: só a sigla do Projeto/Cliente e cor por projeto

**3a. Só a sigla.** No TaskCard o chip de Projeto/Cliente mostra "ITC · ITC Brasil". Passa a mostrar **só a sigla** ("ITC", "BSBIA"). O nome completo vai no `title`/tooltip e no `aria-label`. Aplique o mesmo onde houver o mesmo chip compacto (Lista, Calendário, Minhas tarefas); no detalhe da tarefa e nos seletores o nome completo continua.

**3b. Cor por Projeto/Cliente, com UMs num tom mais claro da mesma cor.** Cada Projeto/Cliente tem uma cor. O chip da UM usa a **mesma matiz em tom mais claro**, para mostrar a hierarquia (a UM pertence ao projeto). Exemplo: BSBIA em azul e BSBIA02 em azul claro.

**Decisões (ADR antes do código; é mudança no Chip do Design System):**

- **Nada de hex livre:** a regra "nunca hex em componente" continua. Crie uma **paleta fechada de 8 a 10 cores de projeto** como tokens em `src/styles/globals.css` (`@theme`). Cada cor tem as variantes do chip de projeto (fundo e texto) e as do chip de UM (fundo mais claro e texto), definidas para o claro (`:root, [data-theme="light"]`) e o escuro (`[data-theme="dark"]`). Escolha matizes que não se confundam com as cores funcionais (`ok`, `warn`, `err`, `info`); use a skill `itc-identidade-visual` como referência de harmonia com a marca.
- Todo par texto/fundo passa em **AA (4,5:1)** nos dois temas. Documente as razões no ADR, como no ADR-057.
- Coluna aditiva `color` em `projects`, guardando a **chave da paleta** (ex.: `blue`), não o hex. Nula = chip ciano atual (`accent`), então nada muda até alguém escolher.
- O admin escolhe a cor em Configurações › Projetos/Clientes (seletor de amostras com o nome da cor no `aria-label`) e ela aparece também na lista de projetos.
- O chip de UM herda a cor do projeto da UM; sem cor definida, mantém o visual atual.
- Uma tarefa com vários projetos (ADR-045) mostra um chip por projeto, cada um com a sua cor.
- Uma variante de cor no próprio `Chip`, sem criar componente paralelo.

Tarefas:

3.1 `docs: add ADR for project colors`
3.2 `feat(ui): show project acronym only on task chips`
3.3 `feat(design): project color palette tokens` — tokens e variante do `Chip`.
3.4 `feat(db): add project color` — coluna, Zod, service, MCP (leitura).
3.5 `feat(ui): pick project color and tint mobile unit chips` — seletor em Configurações e chips coloridos em Kanban, Lista, Calendário, Minhas tarefas e detalhe.
3.6 `test(ui): project chips` — Vitest e E2E com axe nos dois temas, com pelo menos três cores aplicadas.
3.7 `docs: document module 15 item 3` — UI.md (Chip e paleta), SCHEMA, ajuda, PROGRESS. Registre em "Decisões a confirmar" que o artefato do Design System (referência no CLAUDE.md) precisa ser atualizado pelo Cowork.

## Item 4 — Prazo nas subtarefas

Subtarefas são `checklist_items` (ADR-019).

4.1 `feat(db): add due date to checklist items` — coluna `due_date` (date, nula), migração aditiva, `docs/SCHEMA.md`.
4.2 `feat(tasks): set due date on checklist items` — Zod e service (com `task_events` e `Actor`). Na UI do detalhe, definir e limpar o prazo de cada subtarefa com o mesmo seletor de data do prazo da tarefa. Mostrar a data com `tabular-nums` e destacar atraso com o mesmo padrão visual do prazo da tarefa (tokens, sem hex). Subtarefa concluída não aparece como atrasada. Prazo depois do prazo da tarefa é permitido, sem bloqueio.
4.3 `feat(mcp): expose checklist item due date`
4.4 `feat(notifications): remind checklist item due dates` — incluir as subtarefas com prazo no lembrete das 08:00 e no resumo diário do responsável pela tarefa, seguindo as preferências existentes.
4.5 `test(checklist): …` — Vitest e E2E.
4.6 `docs: document module 15 item 4` — ADR se houver decisão nova, API, FLOWS, ajuda, PROGRESS.

## Item 5 — Tarefas Pessoais e nova tela Minhas tarefas

Tarefas que só quem criou enxerga, numa área separada das tarefas e da rotina da equipe.

### Decisões aprovadas pelo Matheus (ADR antes do código)

- **Modelo:** a tarefa pessoal é uma linha de `tasks` com `visibility` (`team` | `personal`, padrão `team`), não uma tabela nova, para reaproveitar checklist, comentários, anexos, prazos e calendário. Migração aditiva.
- **Visibilidade:** só o criador vê e edita. **Nem o admin** vê tarefas pessoais de outra pessoa. O filtro fica no service/consulta, nunca só na UI, e cobre **todos** os caminhos de leitura: Kanban, Lista, Calendário, painel, ciclos, marcos, busca ⌘K, SSE, notificações, histórico/atividade, menções, filtros salvos, templates, exportações, `/tarefas/<n>` aberto pela URL (404 para quem não é dono) e ferramentas MCP.
- **Fora da rotina da equipe:** tarefas pessoais não aparecem nas visões da equipe, não contam no painel nem em ciclos e marcos, não disparam automações da equipe e não notificam outras pessoas.
- **Responsável:** sempre o próprio criador. Não dá para atribuir a outra pessoa, e @menção numa tarefa pessoal não notifica ninguém.
- **Projeto/Cliente opcional na tarefa pessoal.** É exceção à regra "Projeto/Cliente obrigatório", que continua valendo para as tarefas da equipe no banco (`CHECK` aditivo `visibility = 'personal' OR project_id IS NOT NULL`), no Zod e no service. UM e GLPI continuam opcionais.
- **Número:** mesma sequência `TI-<n>` e mesma URL `/tarefas/<n>`. O número pode pular para os outros membros, e isso é aceitável.
- **Status:** mesmo workflow da equipe, incluindo Aguardando.
- **Conversão:** tarefa pessoal pode virar tarefa da equipe (exige Projeto/Cliente e grava evento). Da equipe para pessoal **não**, para nenhuma tarefa da equipe sumir.
- **Exclusão:** o criador pode excluir as próprias tarefas pessoais (o ADR-063 já cobre).
- **Agente (MCP):** age em nome do dono do token. Lê e escreve as tarefas pessoais **do dono do token** e nunca as de outra pessoa. `create_task` ganha `visibility` opcional (padrão `team`). Agente continua sem excluir.

### Tarefas

5.1 `docs: add ADR for personal tasks` — ADR com as decisões acima e as alternativas descartadas.
5.2 `feat(db): add task visibility` — coluna, índice, `CHECK` do projeto, `docs/SCHEMA.md`.
5.3 `feat(tasks): personal task visibility in service` — Zod e `tasksService`: criação, edição e conversão de pessoal para equipe. Um único helper de escopo de leitura (`visibleTo(actor)`), usado por todas as consultas.
5.4 `security(tasks): enforce personal task visibility on all read paths` — aplicar o helper em todos os caminhos listados acima, incluindo SSE, notificações, automações e busca. Commit separado para facilitar a revisão.
5.5 `feat(mcp): personal tasks in mcp tools` — parâmetros e filtro.
5.6 `feat(ui): create personal tasks` — opção "Tarefa pessoal" na criação rápida (`C`) e no formulário; com ela marcada, Projeto/Cliente deixa de ser obrigatório. Indicador discreto de tarefa pessoal no TaskCard, na lista e no detalhe (ícone `lucide` `Lock` ou similar, 16 px, `strokeWidth={1.75}`), com componentes do Design System e sem variantes paralelas. Ação "Mover para a equipe" no detalhe.
5.7 `feat(ui): my tasks tabs` — abas da tela Minhas tarefas, nesta ordem:
   - **Minhas tarefas** (padrão): tudo o que o usuário tem de resolver, ou seja, as pessoais e as da equipe atribuídas a ele.
   - **Pessoais:** criadas pelo usuário e visíveis só para ele.
   - **Atribuídas:** tarefas da equipe atribuídas ao usuário.
   - **Criadas:** tarefas da equipe criadas pelo usuário (as pessoais ficam na aba própria).
   - **Menções.**

   A aba vai na URL (`?aba=`). Sem o parâmetro, abre em Minhas tarefas.
5.8 `feat(ui): my tasks view modes` — alternância **Cards | Lista | Calendário** em Minhas tarefas, reaproveitando os componentes das visões de Tarefas (TaskCard/Board, TaskTable, calendário), com o modo na URL (`?visao=`). Os atalhos `V` `K`/`L`/`C` passam a funcionar também nesta tela (atualize `SHORTCUTS`, o diálogo `?` e a ajuda). Se as preferências já guardam a última visão por usuário, use o mesmo padrão; se não, só a URL. O calendário mostra as tarefas pelo prazo e, se for simples, também as subtarefas com prazo (Item 4), com rótulo diferente.
5.9 `test(tasks): personal tasks visibility` — Vitest de integração cobrindo **cada** caminho de leitura com dono, outro membro, admin, agente do dono e agente de outra pessoa: só o dono e o agente dele veem. E2E: criar tarefa pessoal, vê-la em Minhas tarefas e Pessoais, não vê-la na visão da equipe nem logado como outro usuário, converter para equipe, trocar entre Cards, Lista e Calendário, axe nos dois temas.
5.10 `docs: document module 15 item 5` — `docs/modules/15-ajustes-produto.md`, PRD, FLOWS, UI, API, ARCHITECTURE (escopo de leitura), ajuda (`/ajuda`, com uma seção nova sobre Tarefas pessoais e Minhas tarefas) e PROGRESS.

---

## Fechamento do módulo

- Rode a auditoria de segurança da skill `project-docs` só sobre o que este módulo mudou, com foco no vazamento de tarefas pessoais e no `DROP` do Item 1. Registre o resultado no doc do módulo.
- `docs/modules/15-ajustes-produto.md` completo, com a seção **"Decisões a confirmar"** no topo: a paleta de cores escolhida, o ícone e a cor do Aguardando, a atualização do artefato do Design System e tudo o que mais você decidiu sozinho.
- PROGRESS: CURRENT STATE atualizado, linhas no Registro e "Depois do pull: `npm run db:migrate`" com a lista das migrações novas. Avise que a migração do Item 1 aborta se houver dado nas colunas removidas.
- `develop` no GitHub com CI verde.
- Escreva em `.conversa/para-cowork.md` uma mensagem **"Módulo 15 pronto para revisão"** com os commits por item, as migrações, os ADRs, o resultado do CI, as decisões a confirmar e o que ficou de fora. **Pare aí.**
