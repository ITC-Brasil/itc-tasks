# ITC Tasks — Guia de entrega de UI

> Complementa as telas e o Design System; cobre só o que as telas não mostram.
> - Telas: https://claude.ai/artifact/QeYVvyV9Ri2rAK3AydBap9
> - Design System: https://claude.ai/artifact/YP2eURsV28zVRjGcxAL495 (ler `README.md` e `tokens.json`)
> - Marca: https://claude.ai/artifact/RqMzGQZjWNoxSUmRkpMqfs · arquivos em `public/brand/` e `docs/brand/`

## 1. Tokens no código

- Todos os tokens do Design System vão para `src/styles/globals.css` em `@theme` (Tailwind 4.3),
  claro em `:root, [data-theme="light"]` e escuro em `[data-theme="dark"]`.
- Mapear para as variáveis do shadcn (`--background`, `--primary` etc.) como no README do Design System.
- **Nunca hex solto em componente.** Use `bg-surface`, `text-muted`, `border`, `accent`, `accent-text`.
- Texto e ícones em ciano usam `accent-text`; `accent` é para fundos, anel de foco e item ativo.
- `warn` e `sev-medium` nunca carregam texto no tema claro: só ícone/barra, rótulo em `text-base`.

## 2. Componentes

Os 18 componentes do Design System viram arquivos em `src/components/` (os genéricos em
`ui/`, gerados pelo shadcn com Base UI e restilizados; os de domínio em `tasks/`, `board/`,
`layout/`). Ícones: `lucide-react` 1.58.0, `strokeWidth={1.75}`, 16 px; status e prioridade
são componentes próprios (`StatusIcon`, `PriorityIcon`). No `StatusIcon`, Backlog, A fazer, Em andamento e
Concluído são círculos (`muted`, `muted`, `info`, `ok`); Aguardando é o `Hourglass` do lucide em `warn`
(ADR-067). A cor fica só no ícone: o nome do status é sempre `text-base`.

| Ícone de domínio | lucide |
|---|---|
| Projeto/Cliente | `Folder` |
| Unidade Móvel | `Truck` |
| Chamado GLPI | `Ticket` |
| Prazo | `Calendar` |
| Ciclo | `RefreshCw` |
| Marco | `Flag` |
| Automação | `Zap` |
| Notificações | `Bell` |
| Subtarefas | `ListChecks` |

## 3. Estados de cada tela

| Estado | Regra |
|---|---|
| Carregando (1ª carga) | Skeleton na forma do conteúdo (cards, linhas). Nunca spinner de página |
| Atualizando | Sem indicador; dados otimistas |
| Vazio | Empty state do DS: ícone em `accent-light`, título, uma frase do que aparece ali e um CTA |
| Filtro sem resultado | "Nenhuma tarefa com esses filtros" + botão "Limpar filtros" |
| Erro de rede em ação | Rollback otimista + toast de erro com "Tentar de novo" |
| Erro de carregamento | Card no lugar do conteúdo com a causa e "Recarregar" |
| Sem permissão | Página "Você não tem acesso a esta área" + link para Minhas tarefas |
| Offline (PWA) | Faixa no topo "Sem conexão — mostrando a última versão salva"; ações de escrita desabilitadas com dica |

Empty states com texto definido:

| Tela | Título | Frase | CTA |
|---|---|---|---|
| Minhas tarefas | Nada pendente por aqui | Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog. | Criar tarefa |
| Kanban (coluna) | — | (coluna vazia mostra só "Nova tarefa") | — |
| Notificações | Tudo em dia | Avisos de atribuições, menções e prazos aparecem aqui. | Preferências |
| Automações | Nenhuma automação | Regras "quando isto, faça aquilo" economizam cliques repetidos. | Nova automação |
| Agentes | Nenhum agente conectado | Crie um token para que um agente opere o ITC Tasks pelo MCP. | Novo token |

## 4. Interações

- **Atualização otimista** em: mover card, reordenar, marcar subtarefa, concluir, mudar prioridade/responsável/prazo, marcar notificação como lida.
- **Desfazer** (toast com "Desfazer", 5 s) em: concluir, arquivar, mover em massa. Exclusões não existem para cadastros (ADR-018).
- **Arrastar no Kanban:** card ganha `shadow-2` e 1,5° de rotação; colunas destino destacam a borda em `accent`; teclado: espaço pega, setas movem, espaço solta (dnd-kit).
- **Criação rápida:** abre focada no título; `⌘↵` cria, também com o foco na descrição; "Criar outra" limpa título e descrição e mantém Projeto/Cliente, UM e ciclo. A **descrição** é opcional e fica fechada até "+ Adicionar descrição"; usa o mesmo editor Tiptap do detalhe (`DescriptionEditor`), com rótulo visível; um template com descrição já a abre preenchida; editor vazio não grava descrição (M-086).
- **Edição inline** no detalhe: clicar no título edita; propriedades abrem seletores com busca.
- **Confirmação** só para ações destrutivas ou em massa, sempre dentro da tela (nunca `confirm()` do navegador).
- **Transições** 120–150 ms; respeitar `prefers-reduced-motion`.

## 5. Atalhos de teclado

| Atalho | Ação |
|---|---|
| `⌘K` / `Ctrl K` | Busca e comandos |
| `C` | Criar tarefa |
| `[` | Recolher/expandir sidebar |
| `G` `M` | Ir para Minhas tarefas |
| `G` `T` | Ir para Tarefas |
| `G` `C` | Ir para o ciclo atual |
| `G` `N` | Ir para Notificações |
| `V` `K` / `V` `L` / `V` `C` | Visão Kanban / Lista / Calendário (só em Tarefas; mantém os filtros da URL) |
| `⌘↵` | Enviar (criar, comentar) |
| `Esc` | Fechar modal/painel |
| `?` | Mostrar atalhos |

Atalhos de uma tecla não disparam com foco em campo de texto.

Todos estão em `src/components/layout/shortcut-list.ts`, a fonte do diálogo `?` e da `/ajuda#atalhos`.

A navegação pela lista por teclado (`J`/`K`, `Enter`, `X`) ficou fora por decisão de 19/10/2026 (foco de linha ativa e acessibilidade); pode voltar como item próprio.

## 6. Layout e responsivo

| Faixa | Comportamento |
|---|---|
| ≥ 1280 px | Sidebar 236 px expandida (ou 64 px se o usuário recolheu) |
| 1024–1279 px | Igual, Kanban com rolagem horizontal |
| 768–1023 px | Sidebar começa recolhida; ao expandir, fica sobreposta ao conteúdo |
| < 768 px | Sem sidebar; barra inferior (Minhas, Tarefas, Criar, Ciclo, Mais); Kanban uma coluna por vez com snap; criação em painel inferior; detalhe em tela cheia |

- Estado da sidebar salvo em `user.sidebarCollapsed`; tema em `user.theme`, aplicado no cliente (ADR-038).
- Alvos de toque ≥ 44 px no mobile; campos com fonte 16 px para o iOS não dar zoom.
- Tabelas largas rolam dentro do próprio contêiner, nunca a página.

## 7. Tema

- Só claro e escuro (ADR-013). Seletor em Configurações › Minhas preferências, no menu do usuário e no ⌘K ("Alternar tema").
- A marca dentro do app troca entre `itc-tasks-simbolo-principal.svg` e `-escuro.svg` pelo `data-theme`; os `-auto` são para contextos fora do app (e-mail, README).
- Telas de referência no escuro: Kanban, Detalhe, Painel, Mobile Minhas.

## 8. Acessibilidade

- WCAG 2.2 AA, verificado por `@axe-core/playwright` em Minhas tarefas, Kanban, Lista, Detalhe, Criação rápida e Configurações.
- Status e prioridade nunca só por cor: ícone com forma própria + texto (ou `title`/`aria-label` no card).
- Foco visível: anel de 3 px em `accent-light` + borda `accent` nos campos; `outline` 2 px `accent` nos demais.
- Contraste AA nos dois temas (ADR-035): superfícies com `on-accent` usam `accent-solid` (`#007A80` no claro, 5,13:1); `text-muted` `#636C6C` (4,76:1 sobre `bg-base`). No escuro, `accent-text` é `#46B5BA`, `err` é `#e2705f` (5,05:1 sobre `bg-surface`, ADR-057) e texto sobre `err` usa `on-err` (5,68:1, ADR-039). A regra `color-contrast` do axe fica ligada no E2E, nos dois temas, inclusive com mensagem de erro na tela (`members.spec.ts`).
- `warn` e `sev-medium` continuam sem carregar texto no claro — só ícone/barra.
- Rótulos visíveis em todos os campos; erros dizem como corrigir.

## 9. Textos da interface

- Português do Brasil, caixa de frase, sem emoji, sem exclamação.
- Botões começam com verbo: "Criar tarefa", "Concluir", "Arquivar projeto".
- Toasts no passado: "TI-142 concluída".
- Vocabulário fixo: Tarefa, Subtarefa, Projeto/Cliente, Unidade Móvel (UM), Chamado GLPI, Ciclo, Marco, Etiqueta, Automação, Agente.
- Configurações › Unidades Móveis: colunas e campos "UM" e "Projeto" (Módulo 15); a UM não tem modelo, placa nem base (ADR-066).
- Datas: "Hoje", "Amanhã", "Sex, 17 out", "14 out"; histórico relativo ("há 2 h"); formato numérico `dd/mm/aaaa`.

## 10. PWA

- Manifest e ícones do pacote de identidade (`docs/brand/manifest.webmanifest` → `src/app/manifest.ts`; ícones em `public/icons/`); `theme_color` `#F5F0E8` (claro) e `#141918` (escuro) via meta.
- Splash iOS: tags de `docs/brand/head.html` no `<head>` do layout raiz.
- Prompt de instalação: banner discreto na primeira visita pelo celular; no iOS, instrução "Compartilhar › Adicionar à Tela de Início". "Agora não" não volta naquele aparelho.
- Service worker `public/sw.js` (ADR-054): guarda a última versão vista de cada tela; Sair apaga as telas guardadas.

## 11. Ajuda

- `/ajuda` (ADR-065), para qualquer papel logado: manual em 13 seções com âncoras estáveis (`primeiro-acesso`, `tela-principal`, `criar-tarefa`, `visoes`, `detalhe`, `busca`, `planejamento`, `notificacoes`, `templates-automacoes`, `mcp` com `mcp-claude-code`, `mcp-claude-desktop` e `mcp-hermes`, `celular`, `atalhos`, `papeis`).
- Ilustrações só com componentes do Design System e dados fixos; sem capturas de tela.
- Pontos de entrada: "Ajuda" no menu do usuário (e no "Mais" do celular), "Abrir ajuda" no ⌘K, "Manual completo" no diálogo de atalhos, "Como conectar um agente" em Agentes e MCP.
