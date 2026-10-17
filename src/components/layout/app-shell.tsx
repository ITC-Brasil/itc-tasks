"use client";

import { Ellipsis, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { setSidebarCollapsedAction } from "@/server/actions/preferences";
import { NAV, isActive } from "./nav";
import { savePreference } from "./save-preference";
import { ShortcutsDialog, useShortcut } from "./shortcuts";
import { UserMenu } from "./user-menu";

export type ShellProfile = {
  name: string;
  initials: string;
  role: "admin" | "member";
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
};

const WIDE = "(min-width: 1024px)";

export function AppShell({
  profile,
  children,
}: {
  profile: ShellProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(profile.sidebarCollapsed);
  // 768–1023 px: trilho; expandir sobrepõe o conteúdo e não muda a preferência (UI.md §6)
  // guarda a rota em que abriu: navegar fecha a sobreposição sem efeito extra
  const [overlayAt, setOverlayAt] = useState<string | null>(null);
  const overlay = overlayAt === pathname;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // ADR-038: user.theme é a fonte da verdade; corrige o tema do aparelho se divergir
  useEffect(() => {
    if (resolvedTheme && resolvedTheme !== profile.theme) setTheme(profile.theme);
    // só na montagem: depois disso a troca vem do próprio usuário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => {
    if (!window.matchMedia(WIDE).matches)
      return setOverlayAt((at) =>
        at === window.location.pathname ? null : window.location.pathname,
      );
    setCollapsed(!collapsed);
    savePreference(setSidebarCollapsedAction(!collapsed), () => setCollapsed(collapsed));
  }, [collapsed]);

  // tablet: Esc fecha a sidebar sobreposta e devolve o foco ao botão de expandir
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!overlay) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOverlayAt(null);
      toggleRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlay]);
  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);
  useShortcut("[", toggle);
  useShortcut("?", showShortcuts);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || profile.role === "admin"),
  })).filter((g) => g.items.length);
  const home = groups[0].items[0];
  const expanded = overlay || !collapsed;

  return (
    <div className="flex min-h-dvh">
      {/* tablet: reserva a largura do trilho, a sidebar fica fixa por cima */}
      <div className="hidden w-sidebar-collapsed flex-none md:block lg:hidden" />
      <nav
        aria-label="Navegação principal"
        className={cn(
          "hidden h-dvh flex-none flex-col gap-0.5 overflow-y-auto border-r bg-surface px-2.5 py-3.5 md:flex",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 lg:sticky lg:top-0",
          overlay ? "w-sidebar-width shadow-2" : "max-lg:w-sidebar-collapsed",
          !overlay && (collapsed ? "lg:w-sidebar-collapsed" : "lg:w-sidebar-width"),
          !expanded && "items-center",
        )}
      >
        <Link
          href="/"
          aria-label="ITC Tasks, início"
          className="flex items-center gap-[3px] px-1.5 pt-1 pb-3.5"
        >
          <Logo />
          {expanded && (
            <span aria-hidden="true" className="flex flex-col gap-[3px] font-brand">
              <span className="text-[7.5px] leading-none font-semibold tracking-[0.4em] text-accent-text">
                ITC
              </span>
              <span className="text-[15px] leading-[0.9] font-extrabold tracking-[-0.02em]">
                Tasks
              </span>
            </span>
          )}
        </Link>
        {groups.map((g, gi) => (
          <div key={g.label ?? gi} className="contents">
            {g.label &&
              (expanded ? (
                <div className="px-2 pt-3.5 pb-1.5 text-caption text-muted uppercase">
                  {g.label}
                </div>
              ) : (
                <hr className="my-2 w-7" />
              ))}
            {g.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={expanded ? undefined : item.label}
                  title={expanded ? undefined : item.label}
                  className={cn(
                    "flex h-[34px] items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted",
                    !expanded && "h-10 w-11 justify-center px-0",
                    active &&
                      "bg-accent-light font-semibold text-accent-text hover:bg-accent-light",
                  )}
                >
                  <item.icon
                    aria-hidden="true"
                    className={cn("size-4", active ? "text-accent-text" : "text-muted")}
                  />
                  {expanded && item.label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="flex-1" />
        <button
          ref={toggleRef}
          type="button"
          onClick={toggle}
          aria-label={expanded ? undefined : "Expandir menu"}
          aria-keyshortcuts="["
          className={cn(
            "flex h-[34px] items-center gap-2.5 rounded-md px-2 text-left text-sm text-muted hover:bg-muted",
            !expanded && "h-10 w-11 justify-center px-0",
          )}
        >
          {expanded ? (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          )}
          {expanded && (
            <>
              Recolher menu
              <kbd className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border px-1 text-[11px]">
                [
              </kbd>
            </>
          )}
        </button>
        <UserMenu
          onShowShortcuts={showShortcuts}
          trigger={
            <button
              type="button"
              title={expanded ? undefined : profile.name}
              className={cn(
                "flex h-11 items-center gap-2.5 rounded-md px-2 text-left hover:bg-muted",
                !expanded && "w-11 justify-center px-0",
              )}
            >
              <Avatar initials={profile.initials} size="lg" />
              {!expanded && <span className="sr-only">{profile.name}</span>}
              {expanded && (
                <span className="flex flex-col leading-tight">
                  <span className="text-small font-semibold">{profile.name}</span>
                  <span className="text-xs text-muted">
                    {profile.role === "admin" ? "Admin" : "Membro"}
                  </span>
                </span>
              )}
            </button>
          }
        />
      </nav>
      {overlay && (
        <div
          aria-hidden="true"
          onClick={() => setOverlayAt(null)}
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">{children}</div>

      {/* < 768 px: barra inferior; Tarefas, Criar e Ciclo entram com os Módulos 04, 05 e 10 */}
      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Link
          href={home.href}
          aria-current={isActive(pathname, home) ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted",
            isActive(pathname, home) && "font-semibold text-accent-text",
          )}
        >
          <home.icon className="size-[22px]" aria-hidden="true" />
          Minhas
        </Link>
        <UserMenu
          side="top"
          onShowShortcuts={showShortcuts}
          trigger={
            <button
              type="button"
              className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
            >
              <Ellipsis className="size-[22px]" aria-hidden="true" />
              Mais
            </button>
          }
        />
      </nav>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

// ADR-013: a marca troca pela versão do tema via CSS (data-theme), sem esperar o JS
function Logo() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/itc-tasks-simbolo-principal.svg"
        alt=""
        className="size-[26px] flex-none in-data-[theme=dark]:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/itc-tasks-simbolo-escuro.svg"
        alt=""
        className="hidden size-[26px] flex-none in-data-[theme=dark]:block"
      />
    </>
  );
}
