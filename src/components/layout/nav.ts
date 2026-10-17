import { House, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** prefixo que marca o item como ativo (padrão: o próprio href) */
  match?: string;
  adminOnly?: boolean;
};
export type NavGroup = { label?: string; items: NavItem[] };

// Telas do Design System; cada módulo acrescenta a sua quando ela existir (sem links quebrados)
export const NAV: NavGroup[] = [
  { items: [{ href: "/", label: "Minhas tarefas", icon: House }] },
  {
    label: "Configurar",
    items: [
      {
        href: "/config/membros",
        label: "Configurações",
        icon: Settings,
        match: "/config",
        adminOnly: true,
      },
    ],
  },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
