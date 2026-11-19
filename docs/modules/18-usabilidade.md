# Módulo 18 — Usabilidade do Kanban e da navegação

Onze ajustes aprovados pelo Matheus em 18/11/2026 (`PROMPT_MODULO_18.md`), mais os itens 12 a 21
acrescentados no mesmo dia pelas mensagens M-163 a M-169. Branch `feat/18-usabilidade` a partir da
`develop` atualizada com a `main` (PR #44 mergeado). ADR-081 a ADR-083. **Sem migração.**

## Decisões a confirmar

Escolhas feitas sem o Matheus, sempre a mais conservadora. Cada uma diz onde mudar.

1. **Ordenação no cliente, não no SQL** (ADR-081): `compareKanban` (`src/lib/kanban-order.ts`) é
   aplicada pelo `Board`, o único componente de Kanban; a Lista continua na ordem de `listTasks`.
   `position` não é mais gravado ao mudar de status, mas a coluna fica (migração só aditiva).
2. **Origem do Voltar em `sessionStorage`** (ADR-083), sem `?de=` na URL: só as quatro listas
   (`/`, `/tarefas`, `/tarefas/lista`, `/tarefas/calendario`) contam; outra tela apaga a origem.
   Rótulos "Minhas Tarefas", "Equipe", "Lista", "Calendário" (Lista e Calendário de Minhas Tarefas
   continuam "Minhas Tarefas", pela URL `/`).
3. **Toast de erro substituído:** com `visibleToasts={1}`, um toast novo tira o anterior, inclusive
   o de erro. A ação que falhou já mostrou o erro; não guardamos fila.
4. **Desfazer** (ADR-082): só quem fez a mudança, só enquanto ela é o **último evento** da tarefa
   (um comentário de outra pessoa já recusa). Efeitos disparados (avisos, automações, `unblocked`)
   não voltam. Ação em massa e MCP sem Desfazer. A ação em massa de **uma** tarefa para Concluído
   mostra o convite a comentar, sem Desfazer.
5. **Quem concluiu** no card compacto = autor do último `status_changed` (ator `user`/`agent`);
   concluída por automação ou criada já em Concluído fica sem avatar.
6. **Busca `?q=`** reaproveita o critério do ⌘K (`searchCriteria`): título e descrição, `TI-n`,
   `#GLPI` e código de UM. Texto sem critério (só símbolos) não acha nada. No Calendário, busca sem
   resultado mostra o mês vazio (sem o estado "Nenhuma tarefa encontrada").
7. **Corte de 14 dias** pela data de conclusão em Brasília (hoje e os 13 dias anteriores). "Ver
   concluídas anteriores": em Equipe, Lista com os status de Concluído; em Minhas Tarefas, Lista
   com `?concluidas=1` (só as concluídas da aba).
8. **Contador de atrasadas**: "minhas" = responsável sou eu (pessoais incluídas); Equipe =
   `teamOnly`. Atualiza pelo SSE (que já recarrega o layout), ao focar a janela e a cada 5 min.
9. **Item 12 (pessoal concluída sumia):** a causa era o escopo de Minhas Tarefas, não a consulta:
   Kanban e Lista pediam `openOnly`. Agora Kanban traz as concluídas dos 14 dias e a **Lista traz
   todas** (abertas e concluídas, ADR-047). Antes a Lista de Minhas Tarefas era só de abertas.
10. **Barra de ferramentas (itens 13 e M-165):** escolhida a estrutura em três linhas nas duas
    telas: [abas] … [seletor de visão] / [busca 280 px] [Filtros · n] / filtros (recolhida). Em
    Equipe, sem abas, a linha 1 tem só o seletor à direita. Em Minhas Tarefas a linha de filtros
    tem só "Atrasadas" (o chip removível da primeira versão saiu). Estado aberto/fechado em
    `localStorage`, atalho `F`.
11. **Texto da aba "Minhas tarefas"** (não estava na M-164): "Tudo o que você tem a resolver: as
    pessoais e as da equipe atribuídas a você." Os outros textos batem com a regra. Equipe não tem
    abas: nada a aplicar lá.
12. **Evento da edição de subtarefa** (item 19): reaproveita `checklist_changed` com
    `action: "edited"` e `from`, em vez do tipo novo `checklist_item_updated` (sem mexer nos tipos
    nem nas preferências). Criar com subtarefas grava só o evento `created` (itens na mesma
    transação).
13. **Lixeira vermelha** (item 20): variante `ghost-destructive` do Button em ciclos/marcos,
    recorrências, subtarefas, vínculos e dependências. Ficaram de fora "Remover ação" do formulário
    de automação (não apaga dado salvo) e os botões com texto "Excluir" (secundários, com diálogo
    destrutivo).
14. **Itens 5 e 6, e 8 e 9 da interface,** saíram em um commit cada par: mexem no mesmo `TaskCard` /
    no mesmo toast.

### Para o Cowork atualizar o Design System

- **Toast:** opaco (`bg-surface`, `text-base`, `border`), raio `--radius-lg`, um por vez; ações
  primária (`accent-solid`/`on-accent`) e secundária (`bg-surface` com borda), 6 s.
- **TaskCard atrasado:** borda 1 px `err` + "(atrasada)" para leitor de tela; não vale para
  Concluído e Aguardando.
- **TaskCard `compact`** (coluna Concluído): ID, título e avatar de quem concluiu; chevron
  `ChevronDown`/`ChevronUp` 16 px ao lado da alça.
- **Botão Voltar:** `ArrowLeft` 16 px + rótulo do destino, à esquerda do título no Topbar.
- **Campo de busca:** 280 px (100% no celular), ícone `Search`, fundo `bg-base`.
- **Selo de atrasadas:** `err`/`on-err`, mesmo formato do de notificações, também no trilho.
- **Barra de ferramentas das visões e seletor de visão único** (sem borda, realce `accent-light`;
  no celular só ícones), botão `Filtros · n` (`SlidersHorizontal`).
- **Abas com explicação:** tooltip (mouse e foco); no celular `Info` 16 px em alvo de 44 px com
  popover; abas numa linha com rolagem e fade na borda.
- **Button `ghost-destructive`:** `text-muted` em repouso, ícone `err` no hover/foco, fundo `bg-muted`.

## Itens

| # | Item | Commit |
|---|---|---|
| 1 | Ordenação automática do Kanban (ADR-081) | `1511b1b` |
| 2 | Voltar no detalhe (ADR-083) | `00cec9f` |
| 3 | Minhas Tarefas / Equipe | `e82694a` |
| 4 | Toast opaco, um por vez | `34d69ea` |
| 5, 6 | Borda de atrasada; compacto no Concluído | `3319ade` |
| 7 | Busca `?q=` | `7ce470c` |
| 8, 9 | Convite a comentar; Desfazer (ADR-082) | `d874caf`, `baef4ba` |
| 10 | Concluídas de 14 dias | `12c16fa` |
| 11 | Contador e filtro Atrasadas | `a1704df` |
| 12 | Pessoal concluída some (M-163, bug) | `0b7e8dd` |
| 13 + M-165 | Barra única com filtros recolhíveis | `18e0171` |
| 14 | Explicação das abas e abas deslizantes (M-164) | `1174c29` |
| 15 | Rolagem horizontal no trilho (M-166, bug) | `38959fd` |
| 16 | Linhas e título do Calendário (M-167, bug) | `2c393ef` |
| 17 | Canto do toast (M-168, bug) | `5e5d7de` |
| 18 | Subtarefas na criação (M-168) | `151525d` |
| 19 | Editar texto da subtarefa (M-168) | `c3ef094` |
| 20 | Lixeira em `err` no hover (M-169) | `9c90837` |
| 21 | Número de atrasadas no trilho (M-169) | `4f6111e` |

Também: `a725798` (teste de automações não avalia jobs antigos do banco de teste) e `4c3887f`
(E2E `usability.spec.ts`).

## Arquivos principais

- `src/lib/kanban-order.ts` (+ teste) — `compareKanban`.
- `src/lib/dates.ts` — `isLate`; SQL equivalente `lateSql` e `countLate` em `src/server/services/tasks.ts`.
- `src/server/services/tasks.ts` — `searchCriteria` (⌘K e `?q=`), `?atrasadas`, corte de 14 dias,
  `completedBy`, `lastStatusEventId`, `undoStatusChange`, `moveTask` sem posição.
- `src/server/views.ts` — `mineScope` (escopo das abas de Minhas Tarefas).
- `src/components/tasks/view-toolbar.tsx`, `view-tabs.tsx`, `search-field.tsx`, `status-toast.tsx`,
  `checklist-draft.tsx`; `src/components/layout/back-link.tsx`, `late-badge.tsx`.

## Segurança (auditoria do que mudou)

- **Busca:** `q` com Zod (`trim`, 1–100, no máximo 50 valores, só o primeiro usado); o critério é o
  mesmo do ⌘K, dentro do `listTasks`, depois de `visibleTo(actor)` e do `teamOnly`. Teste: a pessoal
  de outra pessoa não aparece. Sem SQL cru fora do service.
- **Voltar:** nenhum parâmetro de URL; a origem do `sessionStorage` só vale para quatro caminhos
  exatos e a query é refeita com `URLSearchParams` (teste unitário com `//evil.com`, `https://…`).
- **Desfazer:** `lockTask` (mesma visibilidade de quem edita), só o autor do evento (ator `user`),
  só se for o último evento; agente recusado. Ids validados como UUID na action.
- **Contador:** uma contagem com `visibleTo(actor)`; "minhas" pelo responsável, Equipe pelo
  `teamOnly`. Teste: a pessoal de outra pessoa não conta.
- **MCP:** `checklistEdit` com o mesmo Zod (1–200) e índices resolvidos antes da escrita.

Sem achado aberto.

## Testes

- Vitest: 233 (42 arquivos). Novos: `kanban-order.test.ts`, `back-link.test.ts`, `isLate`,
  `undo.test.ts`, `late.test.ts`, casos em `views`, `search`, `tasks`.
- E2E: `usability.spec.ts` (ordem, borda, compacto, Voltar com filtros, busca por ID e texto,
  toast único com ações, Desfazer e recusa, convite a comentar, contador e Atrasadas, trilho sem
  rolagem, Calendário, subtarefas, tooltips; axe nos dois temas) e `tabs-mobile.spec.ts`.

## Fora deste módulo

- Corte de 14 dias por E2E (exige mexer no banco; coberto por integração).
- Reordenar subtarefas na criação (opcional no item 18).
- Prazo da subtarefa na criação.
