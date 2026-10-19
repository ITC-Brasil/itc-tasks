"use client";

import { CircleHelp, Keyboard, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import type { NavItem } from "./nav";
import { clearPageCache } from "./pwa";
import { setThemeAction } from "@/server/actions/preferences";
import { savePreference } from "./save-preference";

export function useToggleTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  return () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    savePreference(setThemeAction(next), () => setTheme(resolvedTheme ?? "light"));
  };
}

export function UserMenu({
  trigger,
  onShowShortcuts,
  side = "right",
  links = [],
}: {
  trigger: React.ReactElement;
  onShowShortcuts: () => void;
  side?: "right" | "top";
  /** mobile: telas fora da barra inferior */
  links?: NavItem[];
}) {
  const router = useRouter();
  const toggleTheme = useToggleTheme();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  async function signOut() {
    await authClient.signOut();
    await clearPageCache().catch(() => {});
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent side={side} align="end" className="w-56">
        {links.map((item) => (
          <DropdownMenuItem key={item.href} onClick={() => router.push(item.href)}>
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
        {links.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={toggleTheme}>
          {dark ? <Sun /> : <Moon />}
          {dark ? "Usar tema claro" : "Usar tema escuro"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onShowShortcuts}>
          <Keyboard />
          Atalhos de teclado
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/ajuda")}>
          <CircleHelp />
          Ajuda
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
