import {
  Bell,
  Bot,
  ChartColumn,
  Columns3,
  Flag,
  House,
  LayoutTemplate,
  RefreshCw,
  Repeat,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** prefixo que marca o item como ativo (padrão: o próprio href) */
  match?: string;
  adminOnly?: boolean;
  /** Módulo 18, item 14: explicação no tooltip (mouse e foco) */
  about?: string;
  /** só para quem não é admin (o admin chega pela aba de Configurações) */
  memberOnly?: boolean;
};
export type NavGroup = { label?: string; items: NavItem[] };

// Telas do Design System; cada módulo acrescenta a sua quando ela existir (sem links quebrados)
export const NAV: NavGroup[] = [
  {
    items: [
      {
        href: "/",
        label: "Minhas Tarefas",
        icon: House,
        about: "Suas tarefas pessoais e as da equipe atribuídas a você.",
      },
      { href: "/tarefas", label: "Equipe", icon: Columns3 },
      { href: "/ciclos", label: "Ciclos", icon: RefreshCw },
      { href: "/marcos", label: "Marcos", icon: Flag },
      { href: "/painel", label: "Painel", icon: ChartColumn },
      { href: "/notificacoes", label: "Notificações", icon: Bell },
      { href: "/templates", label: "Templates", icon: LayoutTemplate },
      { href: "/recorrencias", label: "Recorrências", icon: Repeat }, // ADR-077
    ],
  },
  {
    label: "Configurar",
    items: [
      {
        href: "/config/projetos",
        label: "Configurações",
        icon: Settings,
        match: "/config",
        adminOnly: true,
      },
      { href: "/config/agentes", label: "Agentes e MCP", icon: Bot, memberOnly: true },
      {
        href: "/config/preferencias",
        label: "Minhas preferências",
        icon: SlidersHorizontal,
        memberOnly: true,
      },
    ],
  },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
