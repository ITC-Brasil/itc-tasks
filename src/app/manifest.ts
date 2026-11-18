import type { MetadataRoute } from "next";

// docs/brand/manifest.webmanifest; atalhos apontam para rotas que existem (ADR-054)
const icon = (size: number, purpose: "any" | "maskable" | "monochrome") => ({
  src: `/icons/icon-${size}${purpose === "any" ? "" : `-${purpose}`}.png`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
});

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ITC Tasks",
    short_name: "ITC Tasks",
    description: "Gestão de tarefas do dia a dia do time de TI da ITC.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F5F0E8",
    theme_color: "#F5F0E8",
    icons: (["any", "maskable", "monochrome"] as const).flatMap((p) => [
      icon(192, p),
      icon(512, p),
    ]),
    shortcuts: [
      { name: "Criar tarefa", short_name: "Criar", url: "/?criar=1", icons: [icon(192, "any")] },
      { name: "Início", short_name: "Início", url: "/", icons: [icon(192, "any")] },
    ],
  };
}
