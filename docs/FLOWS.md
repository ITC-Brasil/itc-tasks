# ITC Tasks — Fluxos do app

> Estado: **planejado** (17/10/2026). Diagramas em Mermaid; renderizam no GitHub.
> Telas citadas: https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9

## 1. Mapa de navegação

```mermaid
flowchart LR
  Login[Entrar] --> Minhas[Minhas tarefas]
  Minhas --> Detalhe
  Minhas -->|C| Criar[Criação rápida]
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
  CRON[pg-boss schedule 08:00] --> DUE[prazo hoje · vencidas] --> FO
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

## 9. Arquivar cadastro

```mermaid
flowchart LR
  A[Arquivar Projeto/Cliente ou UM] --> B[archivedAt = now]
  B --> C[Some dos seletores e de list_*]
  B --> D[Tarefas antigas continuam mostrando o nome]
  B --> E[Criar/editar tarefa apontando para ele → ARCHIVED_REFERENCE]
  B --> F[Reativar: archivedAt = null]
```
