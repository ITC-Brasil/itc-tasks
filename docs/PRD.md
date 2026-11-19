# ITC Tasks — PRD (Requisitos de Produto)

**Versão:** 1.0 · **Data:** 17/10/2026 · **Dono do produto:** Matheus Silva
**Estado:** aprovado para implementação. Decisões técnicas em `docs/DECISIONS.md`.

---

## 1. Problema

O time de TI da ITC (4 pessoas) organiza o trabalho do dia a dia entre o GLPI (chamados),
conversas e memória. O Windshift foi instalado para isso e não pegou: boards, portais, horas,
testes e marcos aparecem juntos, e configurar cada parte toma mais tempo do que fazer o
trabalho (ADR-001). Faltam também três coisas que nenhuma ferramenta pronta traz:

1. Saber **de qual Projeto/Cliente** é cada tarefa, sempre.
2. Ligar a tarefa à **Unidade Móvel** atendida e ao **chamado GLPI** de origem.
3. Deixar **agentes de IA** criarem e atualizarem tarefas com as mesmas regras.

## 2. Objetivo e métricas de sucesso

| Métrica | Meta | Como medir |
|---|---|---|
| Adoção | O time deixa de usar o Windshift em até 30 dias após o go-live | Windshift desligado |
| Uso diário | 4 de 4 pessoas acessam em pelo menos 4 dias por semana | `session` por usuário/dia |
| Qualidade do dado | 100% das tarefas com Projeto/Cliente | Garantido por `NOT NULL` — métrica de controle |
| Rastreabilidade | ≥ 70% das tarefas originadas de chamado com `glpiTicket` preenchido | Consulta sobre `tasks` |
| Agentes | Pelo menos 1 agente em uso real criando ou atualizando tarefas no 1º mês | `task_events` com `actorKind = 'agent'` |
| Rapidez | Criar uma tarefa pela criação rápida em menos de 15 s | Teste de uso com o time |

## 3. Usuários

| Persona | Quem | O que precisa |
|---|---|---|
| Coordenador de TI (admin) | Matheus | Ver o todo, planejar ciclos, cuidar de cadastros e automações, ligar agentes |
| Técnico (member) | Ana, Rafael, Lucas (exemplos usados no design) | Saber o que fazer hoje, atualizar rápido, inclusive pelo celular em campo |
| Agente (token MCP) | Claude, triagem do GLPI, relatório semanal | Ler e escrever tarefas sem burlar regras |

## 4. Escopo do MVP

### 4.1 Tarefas (núcleo)

- **T1** Criar tarefa com título, descrição rica, responsável, prioridade (Sem / Baixa / Média / Alta / Urgente), prazo, etiquetas, anexos.
- **T2** Campos ITC: **um ou mais Projetos/Clientes (pelo menos um obrigatório na tarefa da equipe; opcional na tarefa pessoal, ADR-069)**, nenhuma ou várias Unidades Móveis (cada UM de um dos projetos da tarefa), Chamado GLPI opcional (número; link automático) (ADR-045).
- **T3** Subtarefas como checklist com responsável opcional, progresso (ADR-019) e prazo próprio opcional (Módulo 15): pode passar do prazo da tarefa, concluída não fica atrasada, e entra no lembrete das 08:00 do responsável pela tarefa.
- **T4** Vínculos "bloqueia / bloqueada por" e "relacionada".
- **T5** Comentários com @menção; histórico de alterações mostrando pessoa, agente ou automação.
- **T6** ID visível `TI-<número>` (ADR-021).
- **T7** Criação rápida (atalho `C`) sem sair da tela atual; opção "Criar outra".

**Critérios de aceite (T1/T2):**
- Sem Projeto/Cliente, o botão "Criar tarefa" mostra o erro "Escolha um Projeto/Cliente para criar a tarefa." e nada é gravado — na tela **e** via MCP.
- Projeto/Cliente ou UM arquivados não aparecem nos seletores e são recusados se enviados pela API/MCP.
- Informar `48213` em Chamado GLPI gera link para `GLPI_BASE_URL/front/ticket.form.php?id=48213`.

### 4.2 Workflow

- **W1** Status configuráveis pelo admin, cada um numa categoria fixa: Backlog, A fazer, Em andamento, Aguardando, Concluído (ADR-022, ADR-067). Aguardando é a tarefa iniciada e parada por terceiro; conta como aberta e pode ficar atrasada.
- **W2** Mudar para um status `done` marca a tarefa como concluída; sair dele desmarca.

### 4.3 Visões

- **V1** Minhas tarefas: vencidas, hoje, esta semana, depois. Abas (Módulo 15): Minhas tarefas (pessoais + da equipe atribuídas a mim), Pessoais, Atribuídas, Criadas, Menções, na URL (`?aba=`). Modos Cards, Lista e Calendário (`?visao=`), com `V` `K`/`L`/`C`.
- **V1b** Tarefa pessoal (ADR-069): só quem criou vê e edita, nem o admin; fora das visões da equipe, do painel, de ciclos, marcos, automações e notificações a outras pessoas; Projeto/Cliente opcional; responsável sempre o criador; mesma sequência `TI-<n>`; pode ser movida para a equipe (exige Projeto/Cliente), nunca o inverso.
- **V2** Kanban por status com arrastar e soltar, contagem por coluna e "Nova tarefa" na coluna.
- **V3** Lista em tabela com seleção em massa (mover status, atribuir, mudar ciclo, arquivar).
- **V4** Calendário mensal com prazos e marcos.
- **V5** Filtros por ciclo, responsável, Projeto/Cliente, UM, prioridade, etiqueta; filtros salvos.
- **V6** Busca global ⌘K por título, ID (`TI-142`), número GLPI (`#48213`) e código de UM.

### 4.4 Planejamento

- **P1** Ciclos com início e fim; um ativo por vez; progresso e carga por pessoa; encerrar ciclo leva pendências para o próximo (com confirmação).
- **P2** Marcos com prazo, Projeto/Cliente e progresso pelas tarefas ligadas.
- **P3** Painel por Projeto/Cliente: abertas, concluídas no período, vencidas, tempo médio até concluir, concluídas por semana, por status, por UM.
- **P4** Templates de tarefa (com subtarefas) e de projeto; usar template pede Projeto/Cliente e UM.

### 4.5 Automações

- **A1** Regras "Quando → Se (opcional) → Então", com liga/desliga, contador de execuções e última execução.
- **A2** Gatilhos do MVP: tarefa criada, status mudou, responsável definido, prioridade mudou, prazo venceu.
- **A3** Ações do MVP: notificar (criador, responsável, time), mover status, mover para ciclo atual, adicionar etiqueta, comentar (texto com variáveis `{GLPI}`, `{ID}`).
- **A4** Seis regras iniciais pré-cadastradas (as da tela de Automações), a última desligada.

### 4.6 Cadastros

- **C1** Projetos/Clientes: nome, sigla única (2 a 12 letras ou números), tipo (Projeto / Cliente / Interno), entidade no GLPI, ativo/arquivado (ADR-044). Sem responsável padrão: o responsável é escolhido por quem cria a tarefa (ADR-045).
- **C2** Unidades Móveis: código único (rótulo "UM"), Projeto/Cliente (obrigatório, ADR-044), ativa/arquivada, contagem de tarefas abertas.
- **C3** Etiquetas com cor dos tokens. **C4** Membros (admin cria, desativa, troca papel).

### 4.7 Agentes (MCP)

- **M1** Servidor MCP em `/mcp` com as ferramentas de `docs/API.md`.
- **M2** Tokens por agente com nome, dono e permissões (`tasks:read`, `tasks:write`); exibido uma vez; revogável.
- **M3** Toda ação de agente aparece no histórico com selo "via MCP" e o nome do token.

**Critério de aceite (M1/M2):** um token só-leitura que chama `create_task` recebe erro de
permissão e nada é gravado; um token revogado recebe 401 na próxima chamada.

### 4.8 Notificações

- **N1** Central com não lidas / todas / menções e "Marcar todas como lidas".
- **N2** Eventos: atribuída a mim, @menção, comentário em tarefa minha, prazo hoje (08:00), vencida, status mudou em tarefa que criei, ação de agente em tarefa minha.
- **N3** Canais por evento: no app, push, e-mail; silêncio de push fora do expediente; resumo diário por e-mail.
- **N4** Ações do próprio usuário nunca geram notificação para ele mesmo.

### 4.9 Aparência e PWA

- **U1** Tema claro e escuro (sem "sistema"), escolhido por usuário (ADR-013).
- **U2** Sidebar recolhível (atalho `[`), escolha lembrada; abaixo de 1024 px começa recolhida.
- **U3** PWA instalável com ícones, splash e push; no celular, navegação inferior (Minhas, Tarefas, Criar, Ciclo, Mais).

## 5. Fora do escopo (e por quê)

| Fora | Motivo |
|---|---|
| Portal de solicitações / abertura de chamados | O GLPI já faz isso |
| Controle de horas | Sem aderência prevista no time |
| Gestão de testes / QA | Não é trabalho do time |
| Roadmap / Gantt | Ciclos + marcos bastam para 4 pessoas |
| Wiki / páginas | Fora do foco de tarefas |
| Integrações Git, Google Workspace, WhatsApp, e-mail de entrada | Complexidade sem demanda no MVP |
| Hierarquia de tipos (épico, história, bug) e story points | Origem da complexidade do Jira/Windshift |
| Esquemas de permissão configuráveis | Dois papéis bastam |
| Edição offline | O PWA abre o shell e a última lista em cache, mas edita só online (ADR-016) |
| Integração com a API do GLPI | Só link no MVP (ADR-023) |

## 6. Requisitos não funcionais

- **Desempenho:** ações comuns (mover card, marcar subtarefa, concluir) refletem na tela em < 100 ms por atualização otimista; carregar o Kanban do ciclo em < 1 s no servidor da ITC.
- **Acessibilidade:** WCAG 2.2 AA nas telas principais (verificado por axe no E2E); tudo operável por teclado.
- **Segurança:** dados só no servidor da ITC; senhas em Argon2id; tokens só em hash.
- **Idioma:** interface em português do Brasil; datas `dd/mm/aaaa` e `Sex, 17 out`.
- **Disponibilidade:** horário comercial. Backup não definido no MVP (decisão de 17/10/2026, `docs/INFRA.md` §9).

## 7. Migração do Windshift

Levantar o que existe no Windshift na semana do Módulo 12; importar tarefas abertas com
Projeto/Cliente mapeado (planilha de mapeamento revisada pelo Matheus); tarefas sem projeto
identificável vão para um Projeto/Cliente "A classificar". Histórico antigo não é migrado.

## 8. Referências

- Telas: https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9
- Design System: https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495
- Marca: https://claude.ai/artifact/RqMzGQZjWNoxSUmRkpMqfs
- Fluxos: `docs/FLOWS.md` · Guia de UI: `docs/UI.md` · Schema: `docs/SCHEMA.md` · MCP: `docs/API.md`

## Módulo 16 — ajustes de uso (17/11/2026)

Encerrar ciclo sem criar outro; admin exclui ciclos e marcos (ADR-071); horário opcional no prazo de tarefa e subtarefa (ADR-072); Comentários separados da Atividade no detalhe; "Concluídas por técnico" no painel; cadastro de Envolvidos, pessoas de fora do app ligadas às tarefas, com filtro (ADR-073); "Minhas tarefas" vira **Início**, com a aba **Hoje** e o modo Kanban; progresso das subtarefas no card; tokens de MCP privados, inclusive para o admin (ADR-074); paleta de projetos com 12 cores (ADR-075). Detalhes: `docs/modules/16-ajustes-uso.md`.

## Módulo 17 — recorrência, Aguardando com motivo e dependências (18/11/2026)

- **Recorrências** (ADR-077): regra que cria uma tarefa nova por ocorrência (dias úteis, semanal,
  mensal ou a cada N meses, com "último dia"), às 06:00, prazo relativo; pausar, editar e excluir
  sem mexer nas já criadas; pessoal só do dono. Tela `/recorrencias`, "Repetir esta tarefa".
- **Aguardando com motivo** (ADR-078): Compra, Fornecedor, Terceiro, Cliente ou Outro, mais a data
  prevista; lembrete no dia; "previsão vencida" no card; filtro por motivo.
- **Dependências** (ADR-079): "bloqueada por"/"bloqueia" entre tarefas da equipe (ou pessoais do
  mesmo dono), sem ciclo; avisa, não impede; aviso de desbloqueio; filtro "Bloqueadas".

## Módulo 18 — usabilidade do Kanban e da navegação (18/11/2026)

Kanban em ordem automática por prazo e prioridade (ADR-081), sem reordenar à mão; card atrasado com borda; Concluído compacto e só dos últimos 14 dias; busca por título ou `TI-n` nas duas telas; "Início" vira **Minhas Tarefas** e "Tarefas" vira **Equipe**; Voltar no detalhe para a lista de origem (ADR-083); toast opaco, um por vez, com **Desfazer** e convite a comentar ao concluir (ADR-082); contador de atrasadas no menu e filtro Atrasadas; barra de ferramentas única com filtros recolhíveis; explicação das abas; subtarefas na criação e texto da subtarefa editável; correções (pessoal concluída sumia de Minhas Tarefas, rolagem no trilho, linhas do Calendário, canto do toast). Detalhes: `docs/modules/18-usabilidade.md`.

