"use client";

import { Link2Off, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchTasksAction, setLinkAction } from "@/server/actions/tasks";
import type { SearchHit } from "@/server/services/tasks";
import { Pick } from "./fields";

// ADR-079: "bloqueada por" e o inverso, "bloqueia"; não impede mover nem concluir

type Dep = {
  kind: "blocks" | "blocked_by" | "relates";
  number: number;
  title: string;
  completedAt: Date | null;
};
const GROUPS = [
  { kind: "blocked_by", label: "Bloqueada por" },
  { kind: "blocks", label: "Bloqueia" },
] as const;

/** Card: a tarefa tem bloqueadora aberta. Ícone em `warn`, texto para o leitor de tela. */
export function BlockedMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Bloqueada"
      title="Bloqueada por uma tarefa aberta"
      className={cn("text-warn", className)}
    >
      <Link2Off className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

export const openBlockers = (links: Dep[]) =>
  links.filter((l) => l.kind === "blocked_by" && !l.completedAt);

/** Busca de tarefas (a mesma do ⌘K) para escolher a outra ponta. */
function TaskSearch({
  selfNumber,
  disabled,
  onPick,
}: {
  selfNumber: number;
  disabled: boolean;
  onPick: (number: number) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = setTimeout(async () => setHits(await searchTasksAction(q)), 200);
    return () => clearTimeout(id);
  }, [q]);
  const shown = q.trim().length < 2 ? [] : hits.filter((h) => h.number !== selfNumber).slice(0, 6);
  return (
    <div className="relative flex-1">
      <Input
        aria-label="Buscar tarefa"
        placeholder="Buscar por título ou TI-123"
        value={q}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => {
          const n = /^(TI-)?(\d+)$/i.exec(q.trim())?.[2];
          if (e.key === "Enter" && n) {
            e.preventDefault();
            onPick(Number(n));
            setQ("");
          }
        }}
      />
      {shown.length > 0 && (
        <ul
          aria-label="Resultados"
          className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-2"
        >
          {shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(h.number);
                  setQ("");
                }}
              >
                <span className="text-muted tabular-nums">TI-{h.number}</span>
                <span className="truncate">{h.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Dependencies({ task }: { task: { id: string; number: number; links: Dep[] } }) {
  const [kind, setKind] = useState<"blocked_by" | "blocks">("blocked_by");
  const [pending, startTransition] = useTransition();
  const change = (target: number, k: Dep["kind"], add: boolean) =>
    startTransition(async () => {
      const r = await setLinkAction(task.id, task.number, { kind: k, target }, add);
      if (!r.ok) toast.error(r.error);
    });
  const open = openBlockers(task.links).length;
  return (
    <section aria-labelledby="deps" className="flex flex-col gap-2">
      <h2 id="deps" className="flex items-center gap-2 text-h4 font-semibold">
        Dependências
        {open > 0 && (
          <span className="inline-flex items-center gap-1 text-sm font-normal text-muted">
            <BlockedMark />
            {open === 1 ? "1 bloqueadora aberta" : `${open} bloqueadoras abertas`}
          </span>
        )}
      </h2>
      {GROUPS.map((g) => {
        const rows = task.links.filter((l) => l.kind === g.kind);
        if (!rows.length) return null;
        return (
          <div key={g.kind} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-muted">{g.label}</h3>
            <ul>
              {rows.map((l) => (
                <li key={l.number} className="flex min-h-8 items-center gap-2">
                  <Link
                    href={`/tarefas/${l.number}`}
                    className="flex min-w-0 gap-2 hover:underline"
                  >
                    <span className="text-muted tabular-nums">TI-{l.number}</span>
                    <span
                      className={l.completedAt ? "truncate text-muted line-through" : "truncate"}
                    >
                      {l.title}
                    </span>
                    {l.completedAt && <span className="sr-only">(concluída)</span>}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    disabled={pending}
                    aria-label={`Remover dependência com TI-${l.number}`}
                    onClick={() => change(l.number, g.kind, false)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Pick
          label="Tipo de dependência"
          items={GROUPS.map((g) => ({ value: g.kind, label: g.label }))}
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          className="w-40 flex-none"
        />
        <TaskSearch
          selfNumber={task.number}
          disabled={pending}
          onPick={(n) => change(n, kind, true)}
        />
      </div>
    </section>
  );
}
