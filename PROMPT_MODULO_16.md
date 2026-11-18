# Módulo 16 — Ajustes de uso

Doze ajustes pedidos pelo Matheus em 17/11/2026, depois do uso diário do Módulo 15. O Módulo 17 (tarefas recorrentes, motivo e previsão no Aguardando, dependências) vem depois. Não comece nada dele.

Leia `CLAUDE.md`, `docs/PROGRESS.md` e `.conversa/para-claude-code.md` (trate as ABERTAS) antes de começar. Use a skill `project-docs` para toda a documentação. A sessão pode rodar **sem supervisão**: não pare para perguntar no meio. Quando surgir dúvida de produto que não esteja resolvida abaixo, escolha a opção mais conservadora, registre em ADR ou em "Decisões a confirmar" no `docs/modules/16-ajustes-uso.md`, e siga. Só pare ao terminar os doze itens ou num bloqueio real (CI vermelho que você não consegue corrigir, migração que exigiria `DROP` ou reescrita de dados etc.). Nesse caso, documente e pare.

## Fluxo de Git

- Branch `feat/16-ajustes-uso` a partir da `develop` atualizada. Merge na `develop` ao fim de cada item.
- **Um commit por tarefa** (as tarefas numeradas), `type(scope): descrição`, arquivo por arquivo, sem `git add -A`, conferindo `git status --short`. Cada commit tem de passar sozinho em `npm run lint && npm run typecheck && npm test` (no Módulo 15, dois commits intermediários não passavam: evite).
- Ao fim de cada item, rode o E2E do que mudou contra o build de produção (receita no PROGRESS).
- Ao fim: envie a `develop`, espere o CI verde (Quality Check, E2E, Docker build e Security) e corrija o que falhar. Teste instável se corrige na causa, não reexecutando.
- **Não abra PR**: ele só sai depois do "Módulo 16 aprovado". Lembre que o merge na `main` publica em produção depois do CI verde (ADR-070).
- ADRs a partir do **ADR-071** e mensagens a partir da **M-150**: confira o maior número em `docs/DECISIONS.md` e nos dois arquivos de `.conversa/` antes de escrever.
- Próxima migração: **0019**. Migrações **só aditivas**, sem exceção neste módulo.
- Primeiro commit do módulo: `docs: add module 16 prompt`, incluindo este arquivo no Git.

---

## Item 1 — Criação de tarefa sem seleção herdada (correção)

Ao criar uma tarefa, Projeto/Cliente e Unidade Móvel vêm marcados com a última seleção. Devem vir **sempre vazios**, na criação rápida (`C`), no "Nova tarefa" das colunas e em qualquer outro ponto de entrada. A exceção é quando a criação parte de um contexto explícito, por exemplo um filtro de projeto ativo na URL ou a coluna de um projeto. Nesse caso, mantenha o comportamento atual e documente.

1.1 `fix(tasks): start task creation with empty project and unit` — achar a origem (estado guardado, `localStorage`, preferência) e removê-la.
1.2 `test(tasks): …` — E2E: criar duas tarefas seguidas, a segunda abre vazia.

## Item 2 — Encerrar ciclo sem criar outro

Hoje um ciclo só termina quando outro é criado. Passa a existir a ação **"Encerrar ciclo"**, independente. Encerrar não move as tarefas abertas; o que acontece com elas segue a regra atual do Módulo 10 para fim de ciclo (confira o `docs/modules/10-ciclos-marcos-painel.md`). Se não houver regra, elas ficam no ciclo encerrado e isso é registrado em "Decisões a confirmar".

2.1 `feat(planning): close a cycle without creating the next one` — service com evento, UI e MCP, se o MCP tratar de ciclos.
2.2 `test(planning): …`

## Item 3 — Excluir ciclos e marcos

**Decisões (ADR antes do código):** só **admin** exclui. As tarefas vinculadas **continuam** e perdem o vínculo, com evento gravado em cada uma ("removida do ciclo X, que foi excluído"). Ciclo e marco não são cadastros, então a regra "cadastros nunca são excluídos" (ADR-018) não se aplica; diga isso no ADR. Diálogo de confirmação com o número de tarefas afetadas. Agente nunca exclui.

3.1 `docs: add ADR for deleting cycles and milestones`
3.2 `feat(planning): delete cycles and milestones` — service, rastro (siga o padrão do `task_deletions`, ADR-063, se fizer sentido), UI.
3.3 `test(planning): …` — admin exclui, membro é recusado, tarefas ficam sem vínculo e com evento.

## Item 4 — Horário opcional nos prazos

Tarefas e subtarefas passam a aceitar **horário opcional** no prazo. A data continua sendo o prazo; a hora é um complemento.

**Decisões (ADR antes do código):**
- Colunas aditivas `due_time` (time, nula) em `tasks` e em `checklist_items`, com fuso **America/Sao_Paulo**. Não converta `due_date` em timestamp, porque isso reescreveria dados.
- Sem hora: comportamento atual (vence no fim do dia). Com hora: "atrasada" a partir daquele horário, e o lembrete considera a hora (ex.: aviso pouco antes do horário, se o worker já tiver granularidade para isso; senão, o mínimo e registro em "Decisões a confirmar").
- Seletor de hora no mesmo componente de data, opcional. Exibição `17/11 14:30` com `tabular-nums`. Calendário e ordenação por prazo levam a hora em conta.
- MCP: campos `dueTime` (formato `HH:MM`) nas ferramentas de tarefa e de checklist.

4.1 `docs: add ADR for optional due time`
4.2 `feat(db): add optional due time to tasks and checklist items` — migração 0019, SCHEMA.
4.3 `feat(tasks): optional due time in service and mcp`
4.4 `feat(ui): pick and show due time`
4.5 `feat(notifications): consider due time in overdue and reminders`
4.6 `test(tasks): due time` — incluindo virada de dia e fuso.

## Item 5 — Detalhe da tarefa: Comentários separados de Atividade

Hoje comentários e histórico ficam juntos em Atividade. Passam a ser duas seções:
- **Comentários:** sempre visível, com o editor.
- **Atividade** (histórico de eventos): `collapsible`, **recolhido por padrão**, com a contagem no cabeçalho ("Atividade · 12"). O estado aberto/fechado não precisa ser lembrado.

Use os componentes do Design System. Se não houver um collapsible, construa com o Base UI (`Collapsible`) sem criar variante paralela de componente existente. Acessível: botão com `aria-expanded`, navegável por teclado.

5.1 `feat(ui): split comments from activity in task detail`
5.2 `test(ui): …` — E2E e axe nos dois temas.

## Item 6 — Painel: tarefas concluídas por técnico

No `/painel`, um bloco **"Concluídas por técnico"**: um card por membro ativo com o número de tarefas da equipe concluídas no período do painel (o mesmo filtro de dias e de Projeto/Cliente). Use o `Avatar` e o `Card`. Tarefas pessoais não contam (ADR-069). Ordene do maior para o menor. Membro com zero aparece com zero.

6.1 `feat(dashboard): completed tasks by assignee`
6.2 `test(dashboard): …`

## Item 7 — Cadastro "Envolvidos"

Pessoas envolvidas numa tarefa que **não são membros** do app: sem login, sem notificação, sem menção.

**Decisões (ADR antes do código):**
- Configurações › **Envolvidos**: cadastro só com **nome**, arquivável, nunca excluído (ADR-018). Admin cria, edita e arquiva, como nos outros cadastros.
- Campo **Envolvidos** na tarefa, opcional, com vários por tarefa (tabela `task_involved`), no detalhe e na criação completa (a criação rápida não precisa ter).
- Exibição no detalhe. No card, só se couber sem poluir; na dúvida, não mostre.
- **Filtro "Envolvido"** nas visões de Tarefas (Kanban, Lista, Calendário), na URL e nos filtros salvos.
- MCP: listar envolvidos e aceitar `involvedIds` em criar e atualizar tarefa.
- Vale para tarefas pessoais também; arquivado some dos seletores, como os outros cadastros.

7.1 `docs: add ADR for involved people`
7.2 `feat(db): add involved people` — tabelas, migração, SCHEMA.
7.3 `feat(catalog): involved people registry` — service, Zod e tela em Configurações.
7.4 `feat(tasks): involved people on tasks` — service, detalhe e MCP.
7.5 `feat(ui): filter tasks by involved person`
7.6 `test(catalog): involved people`

## Item 8 — "Minhas tarefas" vira "Início", com a aba Hoje

- A página **Minhas tarefas passa a se chamar "Início"**: navegação, título, `<title>`, ⌘K, ajuda e atalho (mantenha `G` `M` e documente; se preferir `G` `I`, aceite os dois). A URL pode mudar para `/inicio`, com **redirect permanente** da URL antiga para não quebrar favoritos e o PWA.
- Abas, nesta ordem: **Hoje** (padrão), Minhas tarefas, Pessoais, Atribuídas, Criadas, Menções. Com a página renomeada, a aba "Minhas tarefas" deixa de repetir o nome.
- **Hoje:** as tarefas de responsabilidade do usuário (o mesmo escopo da aba Minhas tarefas: pessoais + atribuídas) com **prazo hoje** e as **atrasadas** ainda abertas, em dois grupos ("Atrasadas" primeiro, depois "Hoje"). Inclua as subtarefas com prazo hoje ou atrasadas, com rótulo de subtarefa e link para a tarefa. Considere o horário do Item 4. Estado vazio com o `EmptyState`.

8.1 `feat(ui): rename my tasks page to home` — com redirect.
8.2 `feat(ui): today tab on home`
8.3 `test(ui): home and today tab`

## Item 9 — Início: modo Cards vira Kanban

No Início, o modo de exibição **Cards passa a ser Kanban**, com colunas por status, como em Tarefas e reaproveitando `Board`/`Column`/`TaskCard`. Arrastar entre colunas muda o status, com a mesma regra da visão de Tarefas. Alternância **Kanban | Lista | Calendário**, com o modo na URL e os atalhos `V` `K`/`L`/`C`. Isso substitui o agrupamento por prazo aceito no Módulo 15; na aba Hoje, o Kanban mantém as colunas por status.

9.1 `feat(ui): kanban view on home`
9.2 `test(ui): …`

## Item 10 — Indicador de subtarefas no card

No rodapé do `TaskCard`, ao lado da prioridade e da data, um indicador quando a tarefa tem subtarefas: ícone `lucide` (`ListChecks` ou similar, 16 px, `strokeWidth={1.75}`) e o progresso `2/5` em `tabular-nums` e `text-muted`. Com todas concluídas, o mesmo indicador em `ok`, só no ícone. Nome acessível ("2 de 5 subtarefas concluídas"). Sem subtarefas, nada aparece. A contagem tem de vir na consulta das visões (sem N+1).

10.1 `feat(ui): checklist progress on task card`
10.2 `test(ui): …`

## Item 11 — Tokens de MCP privados

Muda a regra atual (o admin vê e gerencia tokens de qualquer pessoa).

**Decisões (ADR antes do código; atualize o CLAUDE.md, tabela de Papéis):**
- Em Configurações › Agentes e MCP, **cada pessoa vê só os próprios tokens**, inclusive o admin.
- O admin **não vê** os tokens dos outros (nem nome, prefixo ou datas), mas tem a ação **"Revogar todos os tokens"** de um membro, em Configurações › Membros, com confirmação e rastro no log. Desativar membro continua cortando o acesso.
- Proteja no service e nas rotas (inclusive as do Better Auth `apiKey`, como no ADR-058), não só na UI. Teste: admin lista via API e não recebe tokens alheios; membro não revoga token alheio.

11.1 `docs: add ADR for private mcp tokens`
11.2 `security(agents): list only the actor's own tokens`
11.3 `feat(members): admin revokes all tokens of a member`
11.4 `test(agents): …`
11.5 `docs: update roles table in CLAUDE.md`

## Item 12 — Paleta de projetos com 12 cores

Ampliar a paleta do ADR-068 de 8 para **12** cores, com os mesmos três tokens por cor (`bg`, `unit-bg`, `fg`) nos dois temas e AA (≥ 4,5:1, mire em ≥ 5:1) em todos os pares. Escolha matizes que fiquem **distinguíveis entre si e das existentes** em chip pequeno (diferença de luminosidade e de matiz, não só de matiz) e que não se confundam com as funcionais (`ok`, `warn`, `err`, `info`). Sugestão de direção: `teal`, `cyan`, `amber`, `red`. Ajuste os nomes se precisar; `teal` e `cyan` não podem ser parecidos com o ciano de destaque (`accent`) da marca. As 8 atuais não mudam de nome nem de valor (projetos já usam).

12.1 `docs: extend ADR-068 palette` — ADR novo que complementa o 068, com a tabela de contraste.
12.2 `feat(design): four more project colors` — tokens, Zod e seletor.
12.3 `test(ui): …` — axe nos dois temas com as 12 cores.

---

## Fechamento do módulo

- Auditoria de segurança da skill `project-docs` só sobre o que mudou, com foco nos tokens privados (Item 11), na exclusão de ciclos e marcos (Item 3) e no escopo da aba Hoje e do Kanban do Início (sem tarefa pessoal alheia). Resultado no doc do módulo.
- `docs/modules/16-ajustes-uso.md` completo, com **"Decisões a confirmar"** no topo. Liste nela, para o Cowork atualizar o artefato do Design System: as 4 cores novas com os valores, o collapsible de Atividade e o indicador de subtarefas no TaskCard.
- Atualize PRD, FLOWS, UI, API, SCHEMA, ARCHITECTURE, a ajuda (`/ajuda`, incluindo Início, aba Hoje, Envolvidos e horário nos prazos) e `SHORTCUTS` no que couber.
- PROGRESS: CURRENT STATE, linhas no Registro e "Depois do pull: `npm run db:migrate`" com a lista das migrações.
- `develop` no GitHub com CI verde.
- Escreva em `.conversa/para-cowork.md` uma mensagem **"Módulo 16 pronto para revisão"** com os commits por item, as migrações, os ADRs, o resultado do CI, as decisões a confirmar e o que ficou de fora. **Pare aí.**
