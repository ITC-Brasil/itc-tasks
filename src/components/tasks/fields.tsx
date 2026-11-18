"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/validation/tasks";
import type { TaskFormOptions } from "@/server/actions/tasks";
import { PriorityIcon, priorityLabel, StatusIcon } from "./badges";

export type PickItem = { value: string; label: string; icon?: React.ReactNode };

// ponytail: Select simples; seletor com busca (UI.md §4) quando a lista de projetos crescer
/** Seletor controlado de um valor; "" = nenhum. */
export function Pick({
  label,
  items,
  value,
  onChange,
  invalid,
  className,
}: {
  label: string;
  items: PickItem[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
}) {
  const current = items.find((i) => i.value === value);
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange((v as string) ?? "")}>
      <SelectTrigger
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn("w-full", className)}
      >
        <SelectValue>
          {current?.icon}
          {current?.label ?? <span className="text-muted">{label}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.icon}
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Seletor de vários valores (etiquetas). */
export function PickMany({
  label,
  items,
  value,
  onChange,
  invalid,
}: {
  label: string;
  items: PickItem[];
  value: string[];
  onChange: (value: string[]) => void;
  invalid?: boolean;
}) {
  const chosen = items.filter((i) => value.includes(i.value));
  return (
    <Select
      multiple
      items={items}
      value={value}
      onValueChange={(v) => onChange((v as string[]) ?? [])}
    >
      <SelectTrigger aria-label={label} aria-invalid={invalid || undefined} className="w-full">
        <SelectValue>
          {chosen.length ? (
            chosen.map((c) => (
              <span key={c.value} className="flex items-center gap-1">
                {c.icon}
                {c.label}
              </span>
            ))
          ) : (
            <span className="text-muted">{label}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.icon}
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LabelDot({ colorToken }: { colorToken: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 flex-none rounded-full"
      style={{ background: `var(--${colorToken})` }}
    />
  );
}

/** Itens dos seletores a partir das opções do servidor. */
export function optionItems(o: TaskFormOptions) {
  return {
    projects: o.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
    statuses: o.statuses.map((s) => ({
      value: s.id,
      label: s.name,
      icon: <StatusIcon category={s.category} />,
    })),
    priorities: PRIORITIES.map((p) => ({
      value: p,
      label: priorityLabel(p),
      icon: <PriorityIcon priority={p} />,
    })),
    people: [
      { value: "", label: "Sem responsável" },
      ...o.people.map((p) => ({ value: p.id, label: p.name })),
    ],
    // ADR-045: só UMs dos projetos escolhidos (e as antigas sem cliente)
    units: (projectIds: string[]) =>
      o.units
        .filter((u) => !u.projectId || projectIds.includes(u.projectId))
        .map((u) => ({ value: u.id, label: u.code })),
    cycles: [
      { value: "", label: "Sem ciclo" },
      ...o.cycles.map((c) => ({
        value: c.id,
        label: `Ciclo ${c.number}${c.state === "active" ? " (atual)" : ""}`,
      })),
    ],
    // ADR-053: só marcos dos projetos da tarefa
    milestones: (projectIds: string[]) => [
      { value: "", label: "Sem marco" },
      ...o.milestones
        .filter((m) => projectIds.includes(m.projectId))
        .map((m) => ({ value: m.id, label: m.name })),
    ],
    labels: o.labels.map((l) => ({
      value: l.id,
      label: l.name,
      icon: <LabelDot colorToken={l.colorToken} />,
    })),
    involved: o.involved.map((p) => ({ value: p.id, label: p.name })), // ADR-073
  };
}
