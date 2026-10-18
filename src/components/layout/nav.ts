import {
  Bell,
  Bot,
  Columns3,
  House,
  LayoutTemplate,
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
  /** só para quem não é admin (o admin chega pela aba de Configurações) */
  memberOnly?: boolean;
};
export type NavGroup = { label?: string; items: NavItem[] };

// Telas do Design System; cada módulo acrescenta a sua quando ela existir (sem links quebrados)
export const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Minhas tarefas", icon: House },
      { href: "/tarefas", label: "Tarefas", icon: Columns3 },
      { href: "/notificacoes", label: "Notificações", icon: Bell },
      { href: "/templates", label: "Templates", icon: LayoutTemplate },
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
