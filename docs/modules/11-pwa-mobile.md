# Módulo 11 — PWA, mobile e acabamento

**Data:** 18/10/2026 · **ADR:** ADR-054 (escrito antes do código; altera o ADR-016) · **Migração:** nenhuma · **Dependência nova:** nenhuma

## O que foi implementado

### PWA
- `public/sw.js` — service worker próprio, sem Serwist (ADR-054). `CACHE_VERSION = "v1"`; caches `pages-v1` (HTML) e `static-v1`. Navegação em rede primeiro, guardando a resposta 200 que não veio de redirecionamento; sem rede → mesma URL → `/` → HTML "Sem conexão" embutido. Em cache primeiro: `/_next/static/`, `/icons/`, `/brand/`, `/splash/`, `/favicon`. Fora do cache: não-GET, outra origem, `/api/`, `/mcp`, `/login` e requisições com cabeçalho `RSC`. O `activate` apaga caches de outras versões. Absorve `push` e `notificationclick` do antigo `public/push-sw.js` (removido; o `badge` passa a ser `icon-192-monochrome.png`).
- `src/components/notifications/push-device.tsx` registra `/sw.js`; no mesmo escopo `/`, a registration antiga é atualizada e a assinatura de push continua.
- `src/app/manifest.ts` — do `docs/brand/manifest.webmanifest`; atalhos `/?criar=1` e `/` (as rotas `/tarefas/nova` e `/minhas` do pacote não existem).
- `src/app/layout.tsx` — `icons`, `appleWebApp` (`capable`, título, 38 `startupImage` gerados de `SPLASH` = 19 aparelhos × claro/escuro, com os `media` de `docs/brand/head.html`) e `viewport.themeColor` `#F5F0E8` / `#141918`.
- `src/components/layout/pwa.tsx` — `Pwa` (registra o SW; convite de instalação só < 768 px, fora de `display-mode: standalone` e sem `itc:install-dismissed` no `localStorage`; Android pelo `beforeinstallprompt`, iOS com a instrução Compartilhar › Adicionar à Tela de Início), `useOnline` (`useSyncExternalStore` em `online`/`offline`), `OfflineBanner`, `clearPageCache` (apaga `pages-*`).
- `src/components/layout/app-shell.tsx` — offline: `OfflineBanner` e o conteúdo dentro de `<fieldset disabled className="contents">`; "Criar" da barra inferior desabilitado.
- `src/components/layout/user-menu.tsx` — Sair chama `clearPageCache()` depois do `signOut`.
- `src/components/tasks/quick-create.tsx` — `?criar=1` abre a criação rápida e sai da URL (`history.replaceState`).
- `src/proxy.ts` — `sw.js` fora do matcher (no lugar de `push-sw.js`); o `.gitignore` não ignora mais `public/sw.js`.

### Mobile (< 768 px)
- Barra inferior Minhas, Tarefas, Criar, Ciclo, Mais (`BAR_ITEMS` em `app-shell.tsx`); "Mais" (`UserMenu` com `links`) lista as telas da navegação que não estão na barra, além de tema, atalhos e Sair. Fica em `accent-text` quando a tela atual está nele.
- Criação rápida como painel inferior: classes `max-md:` no `DialogContent` (`bottom-0`, `max-h-[90dvh]`, `safe-area-inset-bottom`).
- Kanban (`src/components/tasks/board.tsx`): `snap-x snap-mandatory`, coluna `calc(100vw-2rem)` com `snap-center`.
- Detalhe (`src/components/tasks/task-detail.tsx`): o botão de remover subtarefa fica visível no toque (`md:opacity-0` no lugar de `opacity-0`). O detalhe já era rota de tela cheia.

### Acessibilidade
- Trilho recolhido: o nome do item vai em `sr-only` em vez de `aria-label`, para conter o contador de não lidas (axe `label-content-name-mismatch` em "Notificações").
- Chips neutros (`src/components/tasks/badges.tsx`: UM, etiqueta neutra, GLPI, responsável) fixam `text-base`. Herdando `text-muted` sobre `bg-muted`, davam 4,27:1 na central de notificações.

### E2E
- `tests/e2e/auth.setup.ts` + `tests/e2e/session.ts`: o projeto `setup` entra uma vez e grava `test-results/.auth/admin.json`; `desktop` e `mobile` usam esse `storageState`. O `login(page)` de cada spec virou `import { login } from "./session"` (só abre `/`). `auth.spec.ts` roda sem sessão.
- `playwright.config.ts`: `E2E_BASE_URL` (padrão `http://localhost:3000`).
- `axeBothThemes` em `session.ts`: espera o `main`, desliga transições e troca só o `data-theme` (não mexe na preferência do admin). Usado em `mobile.spec.ts`, `planning.spec.ts` e `activity.spec.ts`.
- `tests/e2e/mobile.spec.ts`: manifest e SW, offline, `/?criar=1`, barra inferior + Mais + painel inferior, Kanban uma coluna, axe nos dois temas em Minhas, Kanban, Lista, Detalhe, Criação rápida e Configurações (UI.md §8).
- `tests/e2e/planning.spec.ts` (pendente do Módulo 10, M-061): cria um ciclo; axe em `/ciclos`, `/marcos` e `/painel`.
- `shell.spec.ts`: espera o menu da conta sumir antes do axe.

## Verificação

| Cenário | Como | Resultado |
|---|---|---|
| Manifest, splash e theme-color no HTML | `curl` em `/manifest.webmanifest` e `/login` | ✅ 38 `apple-touch-startup-image`, 2 `theme-color` |
| SW registrado; offline mostra a faixa e desabilita "Criar tarefa" | `mobile.spec.ts` | ✅ |
| Mobile: barra, Mais, painel inferior no fim da tela, Kanban uma coluna | `mobile.spec.ts` (Pixel 7) | ✅ |
| Axe nos dois temas nas 6 telas do UI.md §8 e em Ciclos, Marcos e Painel | `mobile.spec.ts`, `planning.spec.ts` | ✅ |
| Suíte E2E no build de produção (`next build` + `next start -p 3200`, `BETTER_AUTH_URL` na mesma porta), `--workers=1` | `E2E_BASE_URL=http://localhost:3200 npx playwright test` | ✅ 38 passaram, 21 pulados (só desktop ou só mobile), 0 falhas |
| Mesma suíte em paralelo (workers padrão), duas vezes | idem | ✅ 38 e 38 |
| Specs novos no `next dev` | `npx playwright test tests/e2e/mobile.spec.ts tests/e2e/planning.spec.ts` | ✅ |
| Vitest | `npm test` | ✅ 109 |
| Lint e tipos | `npm run lint`, `npm run typecheck` | ✅ 0 erros |

Não verificado em aparelho real: instalação no Android e no iPhone, splash e push com o app instalado. Fica para o go-live (Módulo 12), em `https://tasks.itcbr.xyz`, porque o SW exige HTTPS fora de `localhost`.

## Pendências herdadas, resolvidas

- **3 falhas do E2E no build de produção (M-053) e o limite de login:** a causa era o limite padrão do Better Auth no `sign-in` (3 a cada 10 s, só fora do dev), com "Muitas tentativas" na tela. Resolvido com o login único do `auth.setup.ts`. A falha de tema e axe do `shell.spec` era o menu ainda visível durante a animação.
- **Detalhe em branco intermitente (M-041):** não reapareceu no build de produção com workers em paralelo (duas execuções). Isso reforça a hipótese do rebuild do `next dev`. O `axeBothThemes` espera o `main` antes de analisar.

## Commits

```
353bf41 docs: add ADR-054 for pwa and mobile
4dd37bb feat(pwa): add manifest and service worker
51f3feb feat(mobile): add mobile layouts
8972b10 test(a11y): add accessibility checks
8962284 fix(a11y): set text color on neutral chips
cb7c4ff test(e2e): log in once and run against production build
dc0e6eb test(planning): add cycles, milestones and dashboard e2e
```

O `4dd37bb` traz também a barra inferior e o painel inferior, que estão nos mesmos arquivos do shell e da criação rápida.

## Ficou de fora

- **Componente `Card`** (observação da M-061): são 26 blocos `rounded-xl bg-surface shadow-1` em `ul`, `section`, `div` e `pre`, com paddings diferentes. Extrair o componente não muda comportamento; decisão para o Cowork e o Matheus.
- E2E fora do CI (como desde a M-007): exige banco semeado e servidor.
- Precache: uma tela só abre offline se já foi vista online naquele aparelho (ADR-054).

## Pontos de atenção

- Mudou o `sw.js`? Troque `CACHE_VERSION`, senão telas antigas continuam no `pages-*`.
- `next start` avisa que não combina com `output: standalone`, mas serve para o E2E local; produção usa `node .next/standalone/server.js` (Dockerfile).
- O E2E contra outra porta precisa de `BETTER_AUTH_URL` nela, senão o login recusa com "Invalid origin".
- O `fieldset` desabilitado não bloqueia links. Uma escrita que escape offline ainda falha no servidor e mostra o toast de erro.
