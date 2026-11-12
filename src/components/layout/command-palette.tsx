"use client";

import { Command } from "cmdk";
import { CalendarDays, CircleHelp, List, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PersonalMark, StatusIcon } from "@/components/tasks/badges";
import { openQuickCreate } from "@/components/tasks/quick-create";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SearchHit } from "@/server/services/tasks";
import { searchTasksAction } from "@/server/actions/tasks";
import { NAV, type NavItem } from "./nav";

const ITEM =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-muted";
const GROUP =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted";

const EXTRA: NavItem[] = [
  { href: "/tarefas/lista", label: "Lista de tarefas", icon: List },
  { href: "/tarefas/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/ajuda", label: "Abrir ajuda", icon: CircleHelp },
];

/** ⌘K / Ctrl K (UI.md §5): tarefas por título, TI-, #GLPI e UM; telas; criar tarefa. */
export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // debounce de 150 ms; resposta velha não sobrescreve a nova
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      const rows = q.trim() ? await searchTasksAction(q) : [];
      if (!stale) setHits(rows);
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const screens = [...NAV.flatMap((g) => g.items), ...EXTRA].filter(
    (i) => (!i.adminOnly || isAdmin) && i.label.toLowerCase().includes(term),
  );
  const go = (fn: () => void) => {
    setOpen(false);
    setQ("");
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Busca e comandos</DialogTitle>
        <Command shouldFilter={false} label="Busca e comandos">
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Buscar tarefa, TI-142, #48213, UM…"
            className="h-12 w-full border-b bg-transparent px-4 outline-none placeholder:text-muted"
          />
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="px-2 py-6 text-center text-muted">
              Nenhum resultado
            </Command.Empty>
            {hits.length > 0 && (
              <Command.Group heading="Tarefas" className={GROUP}>
                {hits.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={t.id}
                    className={ITEM}
                    onSelect={() => go(() => router.push(`/tarefas/${t.number}`))}
                  >
                    <StatusIcon category={t.category} />
                    <span className="text-muted tabular-nums">TI-{t.number}</span>
                    <span className={t.category === "done" ? "truncate line-through" : "truncate"}>
                      {t.title}
                    </span>
                    {t.visibility === "personal" && <PersonalMark />}
                    {t.glpiTicket && (
                      <span className="ml-auto text-xs text-muted tabular-nums">
                        #{t.glpiTicket}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading="Ações" className={GROUP}>
              {"criar tarefa".includes(term) && (
                <Command.Item value="criar" className={ITEM} onSelect={() => go(openQuickCreate)}>
                  <Plus strokeWidth={1.75} aria-hidden="true" />
                  Criar tarefa
                </Command.Item>
              )}
              {screens.map((i) => (
                <Command.Item
                  key={i.href}
                  value={i.href}
                  className={ITEM}
                  onSelect={() => go(() => router.push(i.href))}
                >
                  <i.icon strokeWidth={1.75} aria-hidden="true" />
                  {i.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
