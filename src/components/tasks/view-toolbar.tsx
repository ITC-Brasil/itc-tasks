"use client";

import { CalendarDays, Columns3, List, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useSyncExternalStore } from "react";
import { useShortcut } from "@/components/layout/shortcuts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SearchField } from "./search-field";

/**
 * Módulo 18 (itens 13, M-165 e M-171): barra de ferramentas das visões, igual em Minhas Tarefas e
 * Equipe, sobre o fundo da página, sem faixa própria:
 *   linha 1 — [abas, se houver] [busca] [Filtros · n] … [seletor de visão], com a linha fina embaixo;
 *   linha 2 — os filtros, recolhida por padrão (lembrada por navegador).
 * Com abas, a busca é um botão de ícone que abre o campo; no celular a linha quebra.
 */
export function ViewToolbar({
  tabs,
  views,
  filterCount,
  children,
}: {
  tabs?: React.ReactNode;
  views: { label: string; href: string; active: boolean; icon: "kanban" | "list" | "calendar" }[];
  filterCount: number;
  /** a linha de filtros */
  children: React.ReactNode;
}) {
  const open = useSyncExternalStore(subscribe, readOpen, () => false);
  const id = useId();
  useShortcut("f", () => setOpen(!readOpen()));
  return (
    // campos da barra no fundo da página (M-165): `tone="page"` em cada campo (M-171)
    <div className="flex flex-col gap-3 px-4 pt-4 md:px-6 md:pt-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-1.5 md:flex-nowrap">
        {tabs && (
          <div className="-mb-1.5 flex min-w-0 self-end max-md:order-last max-md:basis-full">
            {tabs}
          </div>
        )}
        <SearchField collapsed={!!tabs} />
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex-none bg-base"
        >
          <SlidersHorizontal aria-hidden="true" />
          {filterCount ? `Filtros · ${filterCount}` : "Filtros"}
        </Button>
        <span className="flex-1" />
        <ViewSwitcher views={views} />
      </div>
      <div id={id} hidden={!open} className="flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

const ICONS = { kanban: Columns3, list: List, calendar: CalendarDays };

/** Seletor de visão único (M-165): realce sutil na ativa; no celular só os ícones. */
function ViewSwitcher({ views }: { views: React.ComponentProps<typeof ViewToolbar>["views"] }) {
  return (
    <nav aria-label="Visões" className="flex flex-none gap-1">
      {views.map((v) => {
        const Icon = ICONS[v.icon];
        return (
          <Link
            key={v.label}
            href={v.href}
            aria-current={v.active ? "page" : undefined}
            aria-label={v.label}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm max-md:h-11 max-md:min-w-11 max-md:justify-center",
              v.active ? "bg-accent-light font-medium text-accent-text" : "text-muted",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            <span className="max-md:hidden">{v.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// aberta/fechada por navegador (localStorage), sem servidor; sem storage, fica recolhida
const KEY = "itc-tasks:filtros-abertos";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readOpen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
function setOpen(open: boolean) {
  try {
    localStorage.setItem(KEY, open ? "1" : "0");
  } catch {}
  listeners.forEach((cb) => cb());
}

/** Minhas Tarefas: o filtro Atrasadas (`?atrasadas=1`), o único da tela além da busca. */
export function OverdueToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const on = params.get("atrasadas") === "1";
  const go = (value: boolean) => {
    const next = new URLSearchParams(params);
    next.delete("atrasadas");
    if (value) next.set("atrasadas", "1");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return (
    <>
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox aria-label="Atrasadas" checked={on} onCheckedChange={(v) => go(!!v)} />
        Atrasadas
      </label>
      {on && (
        <Button variant="ghost" size="sm" onClick={() => go(false)}>
          <X aria-hidden="true" /> Limpar filtros
        </Button>
      )}
    </>
  );
}
