# ITC Tasks — Fluxos do app

> Estado: **planejado** (17/10/2026). Diagramas em Mermaid; renderizam no GitHub.
> Telas citadas: https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9

## 1. Mapa de navegação

```mermaid
flowchart LR
  Login[Entrar] --> Minhas[Minhas tarefas]
  Minhas --> Detalhe
  Minhas -->|C| Criar[Criação rápida]
  Minhas -->|abas e modos Cards · Lista · Calendário| Minhas
  subgraph Tarefas
    Kanban <--> Lista <--> Calendario[Calendário]
  end
  Minhas --> Kanban
  Kanban --> Detalhe[Detalhe da tarefa]
  Lista --> Detalhe
  Calendario --> Detalhe
  Kanban -->|C| Criar
  Busca[Busca ⌘K] --> Detalhe
  Busca --> Criar
  Notif[Notificações] --> Detalhe
  Notif --> Prefs[Preferências]
  Planejamento[Ciclos · Marcos · Painel · Templates] --> Lista
  Templates --> Criar
  Config[Configurações] --> Cad[Projetos/Clientes · UMs · Workflow · Etiquetas · Membros]
  Config --> Agentes[Agentes e MCP]
  Config --> Auto[Automações]
  Config --> Prefs
```

## 2. Criar tarefa pela tela

```mermaid
sequenceDiagram
  actor U as Usuário
  participant UI as Criação rápida (client)
  participant A as createTaskAction
  participant S as tasksService
  participant DB as PostgreSQL
  participant Q as pg-boss
  U->>UI: C · digita título · escolhe Projeto/Cliente
  UI->>UI: createTaskSchema.safeParse (Zod)
  alt sem Projeto/Cliente
    UI-->>U: "Escolha um Projeto/Cliente para criar a tarefa."
  else válido
    UI->>A: submit
    A->>A: getSession → Actor{user}
    A->>S: create(actor, input)
    S->>S: valida de novo · projeto e UM ativos
    S->>DB: BEGIN · insert tasks · insert task_events(created) · COMMIT
    S->>DB: NOTIFY task_changed
    S->>Q: automation.evaluate · notification.fanout
    A-->>UI: Task
    UI-->>U: card aparece · toast "TI-161 criada"
  end
```

## 3. Agente cria/atualiza tarefa via MCP

```mermaid
sequenceDiagram
  participant AG as Agente (cliente MCP)
  participant M as /mcp
  participant BA as Better Auth apiKey
  participant T as tool create_task
  participant S as tasksService
  AG->>M: POST tools/call create_task · Bearer itct_…
  M->>BA: verifyApiKey(token)
  alt inválido ou revogado
    M-->>AG: 401
  else válido
    BA-->>M: { userId, permissions }
    M->>T: Actor{agent, userId, apiKeyId}
    T->>T: permissão tasks:write?
    alt sem permissão
      T-->>AG: isError FORBIDDEN
    else
      T->>S: create(actor, input)  (mesmas regras da UI)
      alt sem project / arquivado
        S-->>T: DomainError VALIDATION | ARCHIVED_REFERENCE
        T-->>AG: isError + code
      else ok
        S-->>T: Task
        T-->>AG: TaskSummary (TI-158)
      end
    end
  end
```

Toda chamada de escrita bem-sucedida gera `task_events` com `actorKind = 'agent'` e aparece
com o selo "via MCP" no histórico e na atividade de agentes.

## 4. Mover card no Kanban (atualização otimista)

```mermaid
sequenceDiagram
  actor U as Usuário
  participant B as Board (dnd-kit + TanStack Query)
  participant A as moveTaskAction
  participant S as tasksService
  U->>B: solta TI-149 em "Em andamento"
  B->>B: onMutate: move no cache (posição fracionária entre vizinhos)
  B->>A: { id, statusId, position }
  A->>S: move(actor, …)
  S->>S: categoria nova = done? → completedAt = now()
  S-->>A: ok
  A-->>B: ok → invalida contagens
  Note over B: em erro: rollback do cache + toast<br/>"Não foi possível mover. Tente de novo."
```

Soltar em "Aguardando" (categoria `waiting`, ADR-067) segue o mesmo fluxo: `completedAt` fica nulo, a tarefa
continua aberta nos contadores e nos lembretes de prazo, e as automações com condição `done` não disparam.

## 5. Automação

```mermaid
flowchart TD
  E[Service grava evento<br/>ex.: status_changed] --> J[pg-boss: automation.evaluate]
  J --> R{Regras ativas com<br/>esse gatilho}
  R -->|nenhuma| F[fim]
  R --> C{Condições<br/>batem?}
  C -->|não| F
  C -->|sim| A[Executa ações via services<br/>Actor = automation]
  A --> L[automation_runs ok/erro<br/>runCount++ · lastRunAt]
  A --> G{Ação gerou novo evento?}
  G -->|sim, profundidade < 3| J
  G -->|não| F
```

Proteção contra laço: cada job carrega `depth`; acima de 3 a cadeia para e registra erro em
`automation_runs`.

## 6. Notificações

```mermaid
flowchart TD
  EV[Evento de domínio] --> FO[pg-boss: notification.fanout]
  FO --> WHO[Destinatários do evento<br/>responsável · criador · mencionados]
  WHO --> SELF{É o próprio autor?}
  SELF -->|sim| X[descarta]
  SELF -->|não| PREF[notification_preferences]
  PREF -->|inApp| N[insert notifications → NOTIFY → SSE → sino]
  PREF -->|push| QH{Dentro do expediente?}
  QH -->|sim| P[web-push para cada push_subscription<br/>410 Gone → remove assinatura]
  QH -->|não| H[fica só no app]
  PREF -->|email| D[entra no resumo diário 08:00]
  CRON[pg-boss schedule 08:00] --> DUE[prazo hoje · vencidas<br/>tarefas e subtarefas abertas] --> FO
```

## 7. Ciclo de vida de um ciclo

```mermaid
stateDiagram-v2
  [*] --> planned: Novo ciclo
  planned --> active: Iniciar (só se nenhum ativo)
  active --> closed: Encerrar ciclo
  closed --> [*]
  note right of active
    Ao encerrar: tarefas não concluídas
    vão para o próximo ciclo planejado
    (confirmação na tela, lista revisável)
  end note
```

## 8. Login e token de agente

```mermaid
sequenceDiagram
  actor U as Admin
  participant UI as Configurações › Agentes e MCP
  participant BA as Better Auth apiKey
  U->>UI: Novo token · nome · permissões
  UI->>BA: createApiKey({ name, permissions, userId })
  BA-->>UI: chave em texto UMA vez (hash salvo)
  UI-->>U: "Copie agora: ele não será mostrado de novo."
  U->>UI: Revogar
  UI->>BA: desativa (enabled = false, ADR-049)
  Note over BA: próxima chamada ao /mcp com essa chave → 401
```

## 10. Tarefa pessoal (ADR-069)

```mermaid
flowchart TD
  C[Criação rápida com "Tarefa pessoal"] --> S[tasksService.createTask<br/>visibility = personal, responsável = criador]
  S --> M[Minhas tarefas: abas Minhas tarefas e Pessoais]
  M --> D[Detalhe /tarefas/n]
  D -->|Mover para a equipe, com Projeto/Cliente| T[visibility = team<br/>evento field_changed visibility]
  T --> E[Kanban, Lista, Calendário, painel, automações e notificações da equipe]
  X[Outra pessoa, admin ou agente de outra pessoa] -->|URL, busca, MCP, SSE, anexo| N[NOT_FOUND / 404 / nada na lista]
```

Toda leitura passa por `visibleTo(actor)`; toda escrita e leitura por id, por `lockTask`/`assertVisible`
(`src/server/services/tasks.ts`). O dono recebe os lembretes de prazo; ninguém mais é notificado.

## 9. Arquivar cadastro

```mermaid
flowchart LR
  A[Arquivar Projeto/Cliente ou UM] --> B[archivedAt = now]
  B --> C[Some dos seletores e de list_*]
  B --> D[Tarefas antigas continuam mostrando o nome]
  B --> E[Criar/editar tarefa apontando para ele → ARCHIVED_REFERENCE]
  B --> F[Reativar: archivedAt = null]
```

## 11. Módulo 16 (ajustes de uso)

- **Encerrar ciclo sem próximo:** `/ciclos` → Encerrar ciclo → sem ciclo planejado, todas as pendências ficam sem ciclo (evento "tirou do ciclo" em cada uma) → ciclo `closed`.
- **Excluir ciclo ou marco (admin, ADR-071):** lixeira → diálogo com o número de tarefas → cada tarefa perde o vínculo e grava "removeu do Ciclo N, que foi excluído" → linha apagada, log `[planning]`.
- **Revogar todos os tokens (admin, ADR-074):** Membros → menu da linha → "Revogar todos os tokens" → confirmação → tokens ativos do membro desativados; toast só com a contagem.
- **Início › Hoje:** entrar no app → aba Hoje → tarefas e subtarefas da pessoa com prazo até hoje (a hora conta) → arrastar no Kanban muda o status.

## 12. Módulo 17

- **Recorrência:** 06:00 → `recurrence.daily` → para cada regra ativa, ocorrência mais recente
  pendente (≥ dia da última edição) → linha em `task_recurrence_runs` (PK regra + data) → `insertTask`
  com ator automação e criador = dono → fanout `assigned`. Criar/retomar uma regra roda a de hoje.
- **Aguardando:** mudar para status `waiting` → diálogo (motivo, data) → `applyUpdate` confere →
  `status_changed` com `waiting`. Sair → campos limpos, `waitingCleared` no evento. 08:00 → aviso
  `due_today` com `data.waiting` no dia da previsão.
- **Dependência:** "Bloqueada por" + busca → `addLink` (visibilidade, ciclo sob advisory lock) →
  `dependency_added` nos dois lados. Concluir a última bloqueadora → `unblocked` na bloqueada →
  aviso `status_changed` (`unblockedBy`) ao responsável.

## 13. Módulo 18

- **Mudar status pela tela (arraste, seletor):** `moveTask`/`updateTask` → a action devolve o id do evento `status_changed` (`lastStatusEventId`) → toast com "Desfazer" (6 s; concluir traz também "Adicionar comentário").
- **Desfazer (ADR-082):** `undoStatusChange(actor, taskId, eventId)` → `lockTask` → confere autor (`user`, mesmo `userId`), tipo e que é o último evento da tarefa → `applyUpdate` para o status de antes (restaura o Aguardando do `waitingCleared`) → evento novo. Senão "A tarefa mudou desde então".
- **Voltar (ADR-083):** o layout grava a última lista em `sessionStorage`; o detalhe lê, valida contra quatro caminhos e volta com a busca; sem origem, `/`.
- **Contador de atrasadas:** layout → `countLate(actor)` (uma contagem) → selo; recontagem pelo SSE (`router.refresh`), ao focar e a cada 5 min (`lateCountsAction`).

