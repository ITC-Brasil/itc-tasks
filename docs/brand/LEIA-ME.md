# ITC Tasks — identidade Concluído

Pacote da marca no padrão do ITC NoteScan (identidade Mira).

## Pastas

- `simbolo/` — símbolo em SVG nas 5 versões (principal, ciano, mono-preto, escuro, negativa), cada uma com a variante `-pequeno` para uso abaixo de 24px, e a versão `-auto`, que troca sozinha para as cores escuras quando o sistema está em modo escuro. Use a `-auto` em telas; a `principal` é de tinta fixa e não deve ir sobre fundo escuro (o check #003C3F some). `simbolo/png/` traz PNGs transparentes de 64 a 1024px.
- `lockup/` — horizontal e empilhado nas versões auto, principal, escuro, mono-preto e negativa. O texto está convertido em curvas (Archivo 600 / 800), então não depende de fonte instalada.
- `favicon/` — `favicon.ico` (16/32/48), `favicon.svg` (troca de cor sozinho no tema escuro do navegador) e PNGs 16–64.
- `pwa/` — `icon-192/512` (any), `-maskable`, `-monochrome`, `apple-touch-icon.png` (180), `icon-1024.png`, `manifest.webmanifest` e `head.html` com todas as tags, incluindo os 38 splash screens do iOS.
- `splash/ios/` — 19 tamanhos de iPhone e iPad, em retrato, nas versões claro (#F5F0E8) e escuro (#1B1B1B).
- `android/` — ícone com fundo e sem fundo em 1152 e nas densidades mdpi–xxxhdpi, adaptive (frente e fundo 432) e Play Store 512.
- `itc-tasks-identidade.html` — a especificação: grid, escala, respiro, cores, lockups e aplicações.

## Onde colocar no Next.js (App Router)

```
public/
  favicon.ico            ← favicon/favicon.ico
  favicon.svg            ← favicon/favicon.svg
  manifest.webmanifest   ← pwa/manifest.webmanifest
  icons/                 ← pwa/*.png
  splash/                ← splash/ios/*.png
```

Cole o conteúdo de `pwa/head.html` no `<head>` do `app/layout.tsx`, ou converta para `metadata` (`icons`, `manifest`, `appleWebApp.startupImage`, `themeColor` em `viewport`).

## Regras rápidas

- O símbolo tem no mínimo 16px; abaixo de 24px use a variante `-pequeno`.
- Respiro mínimo de 1 módulo (8u, 1/8 da caixa) em volta da caixa do símbolo.
- "ITC" sempre em ciano, Archivo 600 com espaçamento .42em, acima de "Tasks" em Archivo 800.
- Nunca amplie um PNG pequeno; gere a partir do SVG.
