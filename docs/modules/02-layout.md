# Módulo 02 — Layout, navegação e tema

**Concluído em:** 2026-10-17 · **Branch:** `develop` · **Status:** pronto para revisão do Cowork

## O que foi implementado

### Shell do app (`src/components/layout/`)

- `app-shell.tsx` (Client Component) envolve todas as telas do grupo `(app)`:
  - **≥ 1024 px:** sidebar fixa (`sticky`) de 236 px ou trilho de 64 px, conforme
    `user.sidebarCollapsed`. O estado inicial vem do servidor (sem flash); `[` e o botão
    "Recolher menu" alternam e gravam pelo `preferencesService`.
  - **768–1023 px:** sempre trilho; expandir abre a sidebar sobreposta (com fundo que fecha ao
    clicar) e não muda a preferência. Navegar fecha a sobreposição: o estado guarda a rota em que
    abriu, sem `useEffect`.
  - **< 768 px:** sem sidebar; barra inferior com "Minhas" e "Mais" (menu da conta). Tarefas, Criar
    e Ciclo entram com os Módulos 04, 05 e 10. O conteúdo ganha `pb-16` para não ficar sob a barra.
  - Lockup do DS (símbolo + "ITC / Tasks" em Archivo); o símbolo troca entre `principal` e `escuro`
    por CSS (`in-data-[theme=dark]`), sem esperar o JS.
  - Menu da conta no rodapé da sidebar (Avatar + nome + papel): "Usar tema escuro/claro",
    "Atalhos de teclado", "Sair" (`authClient.signOut()` → `/login`).
- `nav.ts` — grupos e itens da navegação. Só entram telas que existem (hoje: Minhas tarefas e
  Configurações, esta só para admin); cada módulo acrescenta a sua. `isActive` usa `match`
  (prefixo) para Configurações cobrir `/config/*`.
- `topbar.tsx` — título da página (h1) e ações à direita; Minhas tarefas e Membros já usam.
- `shortcuts.tsx` — `useShortcut(key, handler)` (ignora campos de texto, Ctrl/⌘/Alt e repetição) e
  `ShortcutsDialog` (`?`) que lista o array `SHORTCUTS`; os módulos seguintes acrescentam linhas.
- `user-menu.tsx` — menu da conta e `useToggleTheme()`.

### Tema (ADR-013, ADR-038)

- `src/app/layout.tsx` — `ThemeProvider` do `next-themes` com `attribute="data-theme"`,
  `themes={["light","dark"]}`, `enableSystem={false}`, `defaultTheme="light"`,
  `disableTransitionOnChange`; `<html suppressHydrationWarning>` (o `data-theme` fixo saiu).
- O script do `next-themes` aplica o último tema do aparelho antes da pintura. O shell compara com
  `user.theme` na montagem e corrige se divergir; trocar grava em `user.theme`.
- **Por que não no servidor:** com `cacheComponents` (ADR-036) o layout raiz é estático; ler a
  sessão ali quebraria o build. Consequência aceita: num aparelho novo o claro pode aparecer por um
  instante antes do escuro salvo.

### Preferências

- `src/lib/validation/preferences.ts` — `themeSchema` (`light` | `dark`).
- `src/server/services/preferences.ts` — `setTheme(actor, theme)` e
  `setSidebarCollapsed(actor, collapsed)`; o alvo é sempre o próprio actor.
- `src/server/actions/preferences.ts` — actions finas (Zod + service).
- `src/server/actor.ts` — `requireUser()` (com `cache` do React) devolve `{ actor, profile }`
  (nome, iniciais, tema, sidebar); `requireActor()` passa a usá-lo.

### Estados padrão (UI.md §3)

- `src/components/ui/empty-state.tsx` — ícone em `accent-light`, título, frase e CTA.
- `src/components/ui/skeleton.tsx` e `src/app/(app)/loading.tsx` — skeleton da topbar e de linhas.
- `src/app/(app)/error.tsx` — card com a causa e "Recarregar".
- `src/app/(app)/not-found.tsx` — "Página não encontrada" + "Ir para Minhas tarefas".
- `src/components/ui/avatar.tsx` — iniciais sobre `accent-dark`, token novo `--on-accent-dark`
  (`#F4F6F6`, igual nos dois temas, como no DS).
- Minhas tarefas (`/`) mostra o empty state definido no UI.md; "Criar tarefa" fica desabilitado até
  o Módulo 04. A vitrine provisória do Módulo 00 saiu.

### Contraste do tema escuro (ADR-039)

O axe acusou, no escuro, `accent-text` sobre o item ativo (4,15:1) e o botão destrutivo (4,41:1).
- Escuro: `--accent-text: var(--accent-hover)` (`#46B5BA`, 5,03:1).
- Token novo `--on-err` (claro `#FFFFFF`, escuro `#141918`, 4,61:1); destrutivo usa `text-on-err`.

### Outros

- `next.config.ts` — `devIndicators: false`: o indicador do Next cobria o menu da conta no canto
  da sidebar e interceptava os cliques do E2E. Só afeta o `next dev`.

## Testes

- `tests/integration/preferences.test.ts` — tema e sidebar gravam só no próprio usuário.
- `tests/e2e/shell.spec.ts` (em série; mexe nas preferências do admin do seed):
  - desktop: `[` recolhe, o estado sobrevive ao recarregar, `[` expande; `?` abre os atalhos; axe.
  - tema pelo menu da conta, alternando duas vezes, com axe nos dois temas.
  - mobile (Pixel 7): sidebar oculta, barra inferior visível; axe.
- Resultado local: E2E 11 passaram (3 pulados por projeto), Vitest 16 + integração 14, lint e
  typecheck limpos.

## Decisões

- ADR-038 — tema e sidebar no usuário, tema aplicado no cliente pelo `next-themes`.
- ADR-039 — contraste do tema escuro (`accent-text`, `on-err`).

## Ficou de fora

- Meta `theme-color` por tema: entra com o manifest no Módulo 11 (PWA).
- Itens de navegação das telas futuras (Buscar, Notificações, Tarefas, Ciclos, Marcos, Painel,
  Templates, cadastros, Automações) e os contadores: cada módulo adiciona o seu em `nav.ts`.
- Atalhos `⌘K`, `C`, `G …`, `V …`, `J/K`, `X`: chegam com as telas que atendem.
- Seletor de tema em Configurações › Minhas preferências e no ⌘K: telas dos Módulos 06 e 08.
- Atalhos testados por `keydown` real só no E2E; no painel do navegador do Claude a tecla `[` não
  chega como `[`, conferido por evento sintético.
