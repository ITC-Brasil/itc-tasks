# Módulo 17 — Recorrência, Aguardando com motivo e dependências

Três funcionalidades aprovadas pelo Matheus em 12/11/2026 (itens 1 a 3 do backlog), depois do Módulo 16. Nada fora delas entra neste módulo.

Leia `CLAUDE.md`, `docs/PROGRESS.md` e `.conversa/para-claude-code.md` (trate as ABERTAS) antes de começar. Use a skill `project-docs` para toda a documentação. A sessão pode rodar **sem supervisão**: não pare para perguntar no meio. Quando surgir dúvida de produto que não esteja resolvida abaixo, escolha a opção mais conservadora, registre em ADR ou em "Decisões a confirmar" no `docs/modules/17-recorrencia-dependencias.md` e siga. Só pare ao terminar os três itens ou num bloqueio real (CI vermelho que você não consegue corrigir, migração que exigiria `DROP` ou reescrita de dados etc.). Nesse caso, documente e pare.

## Fluxo de Git

- Comece só depois do merge do PR #43 na `main`. Branch `feat/17-recorrencia-dependencias` a partir da `develop` atualizada. Merge na `develop` ao fim de cada item.
- **Um commit por tarefa** (as tarefas numeradas), `type(scope): descrição`, arquivo por arquivo, sem `git add -A`, conferindo `git status --short`. Cada commit tem de passar sozinho em `npm run lint && npm run typecheck && npm test`.
- Ao fim de cada item, rode o E2E do que mudou contra o build de produção (receita no PROGRESS).
- Ao fim: envie a `develop`, espere o CI verde (Quality Check, E2E, Docker build e Security) e corrija o que falhar. Teste instável se corrige na causa, não reexecutando.
- **Não abra PR**: ele só sai depois do "Módulo 17 aprovado". O merge na `main` publica em produção depois do CI verde (ADR-070).
- ADRs a partir do **ADR-077** e mensagens a partir da **M-156**: confira o maior número em `docs/DECISIONS.md` e nos dois arquivos de `.conversa/` antes de escrever.
- Próxima migração: **0021**. Migrações **só aditivas**, sem exceção.
- Toda leitura e escrita de tarefa passa por `visibleTo(actor)` e `lockTask(tx, id, actor)` (ADR-069). Tarefa pessoal nunca aparece para outra pessoa em nenhuma das funções novas.
- Primeiro commit do módulo: `docs: add module 17 prompt`, incluindo este arquivo no Git.

---

## Item 1 — Tarefas recorrentes

Rotinas da TI (backup semanal, conferência mensal, troca de senha trimestral) precisam ser recriadas à mão. Passam a se recriar sozinhas.

**Decisões (ADR antes do código):**
- A recorrência é uma **regra** (tabela própria, ex.: `task_recurrences`), não uma tarefa. Cada execução cria uma **tarefa nova e independente**, a partir de um template existente (Módulo 09) ou de uma tarefa modelo. Editar a regra afeta só as próximas criações.
- Frequências: **diária (dias úteis), semanal (dias da semana), mensal (dia fixo do mês, com "último dia") e a cada N meses**. Sem expressão cron livre na UI.
- Horário de criação: o job roda no fuso `APP_TIMEZONE` (America/Sao_Paulo), uma vez por dia, cedo (antes do lembrete das 08:00). O prazo da tarefa criada é relativo à data de criação (ex.: "vence em 0 dias", "vence em 3 dias"), com hora opcional (ADR-072).
- **Idempotência:** uma execução por regra e por data, garantida por índice único (regra + data de referência). Se o worker ficar parado, ao voltar cria **só a ocorrência mais recente** pendente, não todas as perdidas; registre a escolha.
- Se a ocorrência anterior ainda estiver aberta, cria a nova mesmo assim (comportamento conservador e previsível); a anterior continua aberta e atrasada.
- A tarefa criada grava evento `created` com ator **automação** (como no ADR-052) e um vínculo para a regra de origem, mostrado no detalhe ("Criada pela recorrência X").
- Quem pode: **membros** criam, editam, pausam e excluem regras da equipe (são planejamento, como ciclos); regra de tarefa **pessoal** só o dono, e gera tarefa pessoal. Agente lista regras pelo MCP, mas não cria nem exclui (sem ferramenta de escrita neste módulo).
- Pausar e retomar sem perder a configuração. Excluir a regra não apaga as tarefas já criadas.
- Fanout normal de notificações para o responsável da tarefa criada, sem aviso extra.

1.1 `docs: add ADR for recurring tasks`
1.2 `feat(db): add task recurrences` — migração aditiva.
1.3 `feat(recurrence): recurrence service and daily job` — service, cálculo das datas (testes de mês curto, 29/02, último dia, virada de ano e fuso), job no pg-boss.
1.4 `feat(ui): manage recurrences` — tela (sugestão: aba em `/templates` ou `/recorrencias`), criação a partir de template ou de uma tarefa ("Repetir esta tarefa" no detalhe), selo no card e no detalhe.
1.5 `feat(mcp): list recurrences` — leitura só.
1.6 `test(recurrence): …` — datas, idempotência, worker parado, pessoal, permissões, E2E da tela.

## Item 2 — Motivo e previsão no Aguardando

Hoje "Aguardando" (ADR-067) não diz o quê nem até quando.

**Decisões (ADR antes do código):**
- Ao mover para um status da categoria `waiting` (no detalhe, no Kanban, em massa ou pelo MCP), a pessoa informa **motivo** e **data prevista**.
- Motivo: lista fechada **Compra, Fornecedor, Terceiro, Cliente, Outro**; "Outro" exige texto curto (até 120 caracteres). Data prevista: obrigatória, hoje ou futura.
- Colunas aditivas em `tasks` (ex.: `waiting_reason`, `waiting_note`, `waiting_until`). Ao sair do Aguardando, os campos são **limpos** e o histórico guarda o que eram (evento).
- No arrasto do Kanban e na ação em massa, abre um diálogo pedindo os dois campos; cancelar desfaz a mudança. No MCP, `update_task` para status `waiting` sem os campos responde `VALIDATION`.
- **Lembrete na data prevista**, no job das 08:00, para o responsável (reusar o tipo de aviso existente com `data.waiting`, como no `data.subtask` do Módulo 15). Passada a data e ainda em Aguardando, a tarefa aparece com o indicador de "previsão vencida" (ícone em `warn`, sem virar "atrasada", que continua sendo do prazo).
- Card e detalhe mostram motivo e previsão; filtro por motivo nas visões e nos filtros salvos.
- Tarefas que já estão em Aguardando antes da migração ficam sem motivo e sem previsão (não force preenchimento retroativo); a UI mostra "Sem previsão" e permite completar.

2.1 `docs: add ADR for waiting reason and expected date`
2.2 `feat(db): add waiting fields to tasks` — migração aditiva.
2.3 `feat(tasks): require reason and expected date when waiting` — service, Zod, eventos, MCP.
2.4 `feat(ui): waiting dialog, card and filter`
2.5 `feat(notifications): remind on expected date`
2.6 `test(tasks): …` — obrigatoriedade em todos os pontos de entrada, limpeza ao sair, lembrete, legado sem campos, E2E do arrasto.

## Item 3 — Dependências entre tarefas

"Bloqueada por TI-n".

**Decisões (ADR antes do código):**
- Relação única **"bloqueada por"** (o inverso, "bloqueia", é só exibição). Tabela própria (ex.: `task_dependencies`), chave (tarefa, bloqueadora), sem auto-dependência e **sem ciclo** (A→B→A), conferido no service dentro da transação.
- A dependência **não impede** mover ou concluir a tarefa bloqueada; só avisa (indicador "Bloqueada" no card, diálogo de confirmação ao concluir com bloqueadora aberta). Registre como decisão conservadora.
- Quando a última bloqueadora é concluída, o responsável da tarefa bloqueada recebe um aviso ("TI-n foi desbloqueada"), pelo fanout existente.
- Só entre tarefas da equipe, ou entre tarefas pessoais do mesmo dono. Pessoal não bloqueia tarefa da equipe nem o contrário (não vazar existência de pessoal). Converter pessoal → equipe com dependências: recuse e explique, ou remova com evento; escolha o conservador e registre.
- Excluir tarefa (ADR-063) remove as dependências dela por cascade, com evento nas tarefas do outro lado.
- Detalhe: seção "Dependências" com "Bloqueada por" (adicionar pela busca de tarefas) e "Bloqueia". Eventos `dependency_added`/`dependency_removed` nos dois lados.
- MCP: `get_task` devolve `blockedBy` e `blocks`; `update_task` ganha `blockedByAdd`/`blockedByRemove` por número (`TI-n`).
- Filtro "Bloqueadas" nas visões e nos filtros salvos.

3.1 `docs: add ADR for task dependencies`
3.2 `feat(db): add task dependencies` — migração aditiva.
3.3 `feat(tasks): dependencies service` — ciclo, visibilidade, eventos, aviso de desbloqueio.
3.4 `feat(ui): dependencies in task detail and card`
3.5 `feat(mcp): dependencies in get_task and update_task`
3.6 `test(tasks): …` — ciclo recusado, pessoal × equipe, exclusão em cascata, aviso, E2E.

---

## Fechamento do módulo

- Auditoria de segurança da skill `project-docs` só sobre o que mudou, com foco em: job de recorrência (idempotência, ator automação, tarefa pessoal), dependências sem vazar tarefa pessoal (inclusive em mensagens de erro e no MCP), e validação do Aguardando em todos os pontos de entrada. Resultado no doc do módulo.
- `docs/modules/17-recorrencia-dependencias.md` completo, com **"Decisões a confirmar"** no topo. Liste nela, para o Cowork atualizar o artefato do Design System, os componentes novos (selo de recorrência, diálogo do Aguardando, indicadores "previsão vencida" e "Bloqueada", seção Dependências) com ícones e tokens.
- Atualize PRD, FLOWS, UI, API, SCHEMA, ARCHITECTURE, a ajuda (`/ajuda`) e `SHORTCUTS` no que couber.
- PROGRESS: CURRENT STATE, linhas no Registro e "Depois do pull: `npm run db:migrate`" com a lista das migrações.
- `develop` no GitHub com CI verde.
- Escreva em `.conversa/para-cowork.md` uma mensagem **"Módulo 17 pronto para revisão"** com os commits por item, as migrações, os ADRs, o resultado do CI, as decisões a confirmar e o que ficou de fora. **Pare aí.**
