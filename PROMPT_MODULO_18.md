# Módulo 18 — Usabilidade do Kanban e da navegação

Onze ajustes de usabilidade aprovados pelo Matheus em 18/11/2026. Nada fora deles entra neste módulo. Nenhum exige migração.

Leia `CLAUDE.md`, `docs/PROGRESS.md` e `.conversa/para-claude-code.md` (trate as ABERTAS) antes de começar. Use a skill `project-docs` para toda a documentação. A sessão pode rodar **sem supervisão**: quando surgir dúvida de produto não resolvida abaixo, escolha a opção mais conservadora, registre em ADR ou em "Decisões a confirmar" no `docs/modules/18-usabilidade.md` e siga. Só pare ao terminar ou num bloqueio real.

## Fluxo de Git

- Comece só depois do merge do PR #44 na `main`. Branch `feat/18-usabilidade` a partir da `develop` atualizada; merge na `develop` ao fim.
- **Um commit por tarefa**, `type(scope): descrição`, arquivo por arquivo, sem `git add -A`. Cada commit passa sozinho em `npm run lint && npm run typecheck && npm test`.
- **ADR em commit próprio, antes do código** (observação da M-160).
- ADRs a partir do **ADR-081**; mensagens a partir da **M-163** (confira o maior número antes).
- Sem migração prevista. Se alguma se mostrar necessária, só aditiva, e registre o motivo.
- Nada muda em `visibleTo` / `teamOnly`: a busca e a ordenação usam as mesmas consultas já filtradas.
- Não abra PR: só depois do "Módulo 18 aprovado".
- Primeiro commit: `docs: add module 18 prompt`, incluindo este arquivo.
- Itens 9 a 11 acrescentados pelo Matheus em 18/11/2026, antes do início do módulo.

---

## Item 1 — Ordenação automática do Kanban (ADR)

Hoje a coluna segue `tasks.position` e o que entra vai para o fim. Passa a ser automática em **todas** as visões Kanban (Minhas Tarefas e Equipe):

1. Tarefas **com prazo** primeiro, por prazo crescente (atrasadas no topo); com hora (ADR-072), a hora desempata dentro do dia; sem hora conta como fim do dia.
2. No mesmo prazo, **prioridade** da maior para a menor.
3. Depois, `created_at` mais recente primeiro; por fim `number` (ordem estável).
4. Tarefas **sem prazo** no fim da coluna, por prioridade e depois `created_at` mais recente.
5. Coluna da categoria `done`: por data de conclusão, mais recente primeiro.

- Arrastar **entre colunas** continua mudando o status; arrastar **dentro da mesma coluna** deixa de reordenar (o card volta à posição calculada). Não grave mais `position` ao mover; não remova a coluna (migração só aditiva). Registre no ADR.
- A ordenação fica num lugar só (função compartilhada, de preferência no SQL do service), com teste unitário dos casos acima.
- Lista e Calendário não mudam.

## Item 2 — Botão Voltar no título da tarefa

- Na página `/tarefas/<n>`, seta (`ArrowLeft`, lucide, 16 px) à esquerda do título, com o rótulo do destino: "← Minhas Tarefas" ou "← Equipe" (ou o nome da visão de origem: Calendário, Lista, Busca…).
- O destino é a **lista de origem com os filtros da URL preservados**, não `history.back()`. Passe a origem pelo link (ex.: `?de=` com caminho relativo validado contra uma lista de rotas internas, sem redirecionamento aberto) ou guarde em estado da navegação; sem origem conhecida (link direto, notificação, e-mail), vai para Minhas Tarefas.
- Acessível por teclado, com `aria-label`; no mobile, o mesmo botão no topo.

## Item 3 — Renomear abas

- "Início" → **"Minhas Tarefas"**; "Tarefas" → **"Equipe"**. Sidebar, trilho recolhido, barra inferior mobile, títulos de página, `<title>`, CommandPalette, ajuda (`/ajuda`), `SHORTCUTS` e docs.
- URLs continuam `/` e `/tarefas` (e `/tarefas/<n>` para o detalhe). Atualize os E2E que procuram pelos rótulos.
- Isso substitui a decisão do item 11 do Módulo 16: registre no doc do módulo.

## Item 4 — Toast opaco e um por vez

- Causa provável: `src/components/ui/sonner.tsx` usa `var(--popover)`, `--popover-foreground` e `--border`, que não existem nos tokens do `globals.css` → fundo transparente. Use tokens do Design System (`bg-surface`, `text-base`, a borda padrão), sem hex, nos dois temas, com contraste AA verificado pelo axe.
- `visibleToasts={1}`: um toast visível por vez; o novo substitui o anterior. Confira que toasts de erro não se perdem (se substituídos, a ação já mostrou o erro; registre a decisão).

## Item 5 — Borda nos cards atrasados

- Card com prazo vencido ganha borda fina (1 px) no token `err`. Use a mesma regra de "atrasada" que já existe (data e hora, fuso `APP_TIMEZONE`).
- **Não** recebem a borda: tarefas da categoria `done` e `waiting`.
- Não pode ser o único sinal (acessibilidade): mantenha o indicador de prazo em vermelho que já existe e um texto para leitor de tela ("atrasada").
- Variante do `TaskCard`, não componente paralelo.

## Item 6 — Cards compactos em Concluído

- Na coluna da categoria `done`, o card aparece **compacto**: ID, título e avatar de quem concluiu.
- Um **chevron** (botão próprio, `ChevronDown`/`ChevronUp`) expande o card para o formato normal; o **título sempre abre** a tarefa.
- Estado de expansão só local (não persistir). Sem "duplo clique" com dois significados.
- Variante `compact` do `TaskCard`.

## Item 7 — Busca nas telas Minhas Tarefas e Equipe

- Campo "Buscar por título ou TI-123" no topo das duas telas (todas as visões delas), filtrando o que está na tela.
- Aceita `TI-123`, `ti123` ou `123` (número exato) e texto (título; incluir descrição se a busca existente do ⌘K já cobrir, reaproveitando a mesma função do service).
- Filtro no servidor, na URL (`?q=`), combinável com os outros filtros e com filtros salvos; debounce ~300 ms; Esc limpa. Atalho `/` foca o campo (adicione em `SHORTCUTS` e na ajuda), sem conflitar com campos de texto.
- Estado vazio com "Nenhuma tarefa encontrada para 'x'" e botão de limpar.

## Item 8 — Convite a comentar ao concluir

- Ao concluir uma tarefa pela UI (botão no detalhe, arraste para coluna `done`, ação em massa só se for uma tarefa), mostrar toast "TI-n concluída" com ação **"Adicionar comentário"**, que abre o detalhe com o editor de comentário focado (ex.: `/tarefas/<n>#comentar`).
- Não obrigatório, não bloqueia. Em massa (várias tarefas), sem convite. Concluída por automação ou MCP, sem convite.
- Combina com o item 4: é o toast visível; mantenha tempo suficiente para clicar (~6 s).

## Item 9 — Desfazer no toast

- Ao **mover** uma tarefa de status (arraste no Kanban ou seletor) e ao **concluir** uma tarefa pela UI, o toast traz **"Desfazer"** por ~6 s.
- Ao concluir, o toast do item 8 fica com as duas ações: "Adicionar comentário" e "Desfazer".
- Desfazer volta ao status anterior **pelo service**, com ator `user` e **evento novo** (`task_events` é só-inserção; não apague o evento original). Se o status anterior era Aguardando, restaure motivo, texto e previsão (ADR-078) a partir do evento.
- Efeitos já disparados (notificação "concluída", automações) não são desfeitos; registre no ADR. Se a tarefa mudou de novo nesse meio-tempo (outra pessoa, automação), o Desfazer recusa com "A tarefa mudou desde então" (compare a versão/`updated_at`).
- Ação em massa: sem Desfazer neste módulo. Item 4 vale: com um toast por vez, um novo toast substitui o anterior e encerra o Desfazer dele.

## Item 10 — Concluídas antigas saem do Kanban

- Nas visões **Kanban** (Minhas Tarefas e Equipe), a coluna da categoria `done` mostra só tarefas concluídas **nos últimos 14 dias** (data de conclusão, fuso `APP_TIMEZONE`). Constante única, não configurável neste módulo.
- Nada é arquivado nem alterado no banco: é só filtro da visão. Lista, Calendário, painel, ⌘K, MCP e filtros continuam mostrando todas.
- No pé da coluna: "Ver concluídas anteriores" → Lista com filtro de concluídas.
- Com busca ativa (item 7, `?q=`), o Kanban inclui as concluídas antigas que casam com a busca, para nada ficar escondido de quem procura.

## Item 11 — Contador de atrasadas na navegação

- Número ao lado de **"Minhas Tarefas"** = minhas tarefas atrasadas (responsável sou eu, incluindo as pessoais). Ao lado de **"Equipe"** = atrasadas da equipe (`teamOnly`). Mesma regra de "atrasada" do item 5 (fora `done` e `waiting`).
- Sem atrasadas, o número não aparece. Com atrasadas, selo pequeno em `err`/`on-err` (ADR-039); no trilho recolhido, ponto com o número em tooltip; na barra inferior mobile, o mesmo selo.
- **Clicar no nome** abre a tela normal; **clicar no número** abre a mesma tela com o filtro **"Atrasadas"** aplicado. Crie esse filtro (`?atrasadas=1`) nas visões e nos filtros salvos, removível como os outros; o clique no número é atalho para ele.
- Atualiza pelo SSE existente quando tarefas mudam, e na virada do dia (prazo vence sem evento): recalcule ao focar a janela e a cada poucos minutos, sem consulta pesada (uma contagem agregada por usuário).
- `aria-label` com o texto ("3 tarefas atrasadas").

---

## Fechamento do módulo

- Auditoria de segurança da skill `project-docs` só sobre o que mudou: busca (`visibleTo`/`teamOnly`, sem vazar pessoal, sem SQL cru fora dos services, limite de tamanho do `q` no Zod) parâmetro de origem do Voltar (sem redirecionamento aberto), Desfazer só para quem pode editar a tarefa e contador sem contar tarefa pessoal de outra pessoa.
- E2E: ordenação, voltar com filtros, busca por ID e texto, card compacto, toast único com ação, borda de atrasada, Desfazer (incluindo recusa quando a tarefa mudou), corte de 14 dias com e sem busca, contador e filtro Atrasadas; axe nos dois temas.
- `docs/modules/18-usabilidade.md` com **"Decisões a confirmar"** no topo e a lista de mudanças para o Cowork atualizar o artefato do Design System (Toast opaco com ações, TaskCard atrasado e compacto, botão Voltar, campo de busca, selo de atrasadas na navegação), com ícones e tokens.
- Atualize PRD, FLOWS, UI, ajuda, `SHORTCUTS` e PROGRESS (CURRENT STATE e Registro).
- `develop` no GitHub com CI verde.
- Escreva em `.conversa/para-cowork.md` **"Módulo 18 pronto para revisão"** com os commits por item, ADRs, CI, decisões a confirmar e o que ficou de fora. **Pare aí.**
