"use client";

import { Bookmark, CalendarDays, Columns3, List, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FILTER_PARAMS, type TaskFilters, filtersQuery } from "@/lib/validation/tasks";
import {
  type TaskFormOptions,
  createSavedFilterAction,
  deleteSavedFilterAction,
} from "@/server/actions/tasks";
import { PickMany, optionItems } from "./fields";

export type View = "kanban" | "list" | "calendar";
export const VIEW_PATH: Record<View, string> = {
  kanban: "/tarefas",
  list: "/tarefas/lista",
  calendar: "/tarefas/calendario",
};
const VIEW_TABS = [
  { view: "kanban", label: "Kanban", icon: Columns3 },
  { view: "list", label: "Lista", icon: List },
  { view: "calendar", label: "Calendário", icon: CalendarDays },
] as const;

type Saved = { id: string; name: string; view: string; filters: TaskFilters };

/** ADR-046: filtros na URL; mudar filtro é navegação. */
export function FilterBar({
  view,
  filters,
  options,
  saved,
}: {
  view: View;
  filters: TaskFilters;
  options: TaskFormOptions;
  saved: Saved[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const items = optionItems(options);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const current = filtersQuery(filters);
  const active = saved.find((s) => s.view === view && filtersQuery(s.filters) === current);
  // parâmetros que não são filtro (ex.: ?mes= do calendário) seguem na URL
  const extra = new URLSearchParams(params);
  for (const p of Object.keys(FILTER_PARAMS)) extra.delete(p);

  function apply(next: Partial<TaskFilters>) {
    const q = [filtersQuery({ ...filters, ...next }), extra.toString()].filter(Boolean).join("&");
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const pick = (label: string, field: keyof TaskFilters, list: { value: string }[]) => (
    <div className="w-44">
      <PickMany
        label={label}
        items={list as never}
        value={Reflect.get(filters, field) as string[]}
        onChange={(v) => apply({ [field]: v })}
      />
    </div>
  );

  function save() {
    start(async () => {
      const r = await createSavedFilterAction({ name, view, filters });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Filtro salvo");
      setNaming(false);
      setName("");
      router.refresh();
    });
  }

  function remove(s: Saved) {
    start(async () => {
      const r = await deleteSavedFilterAction(s.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Filtro "${s.name}" excluído`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-4 py-2 md:px-6">
      <nav aria-label="Visões" className="flex rounded-md border p-0.5">
        {VIEW_TABS.map((t) => (
          <Link
            key={t.view}
            href={current ? `${VIEW_PATH[t.view]}?${current}` : VIEW_PATH[t.view]}
            aria-current={t.view === view ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm",
              t.view === view ? "bg-accent-light font-medium text-accent-text" : "text-muted",
            )}
          >
            <t.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t.label}
          </Link>
        ))}
      </nav>
      {view !== "kanban" && pick("Status", "statusIds", items.statuses)}
      {pick("Responsável", "assigneeIds", items.people.slice(1))}
      {pick("Projeto/Cliente", "projectIds", items.projects)}
      {pick(
        "Unidade Móvel",
        "mobileUnitIds",
        items.units(
          filters.projectIds.length ? filters.projectIds : options.projects.map((p) => p.id),
        ),
      )}
      {pick("Prioridade", "priorities", items.priorities)}
      {pick("Etiqueta", "labelIds", items.labels)}
      {pick("Ciclo", "cycleIds", items.cycles.slice(1))}
      {current && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <X aria-hidden="true" /> Limpar filtros
        </Button>
      )}
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
          <Bookmark aria-hidden="true" /> {active ? active.name : "Filtros salvos"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {saved.map((s) => {
            const q = filtersQuery(s.filters);
            const path = VIEW_PATH[s.view as View] ?? VIEW_PATH.kanban;
            return (
              <DropdownMenuItem key={s.id} onClick={() => router.push(q ? `${path}?${q}` : path)}>
                {s.name}
              </DropdownMenuItem>
            );
          })}
          {saved.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem disabled={!current} onClick={() => setNaming(true)}>
            Salvar filtro atual…
          </DropdownMenuItem>
          {active && (
            <DropdownMenuItem onClick={() => remove(active)}>
              Excluir &quot;{active.name}&quot;
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <DialogHeader>
              <DialogTitle>Salvar filtro</DialogTitle>
            </DialogHeader>
            <label className="mt-4 block text-sm font-medium" htmlFor="saved-filter-name">
              Nome
            </label>
            <Input
              id="saved-filter-name"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
