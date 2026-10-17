import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { monthGrid, shiftMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/server/services/tasks";
import { PriorityIcon } from "./badges";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** PRD V4: grade mensal com os prazos (marcos no Módulo 10 — ADR-046). */
export function MonthCalendar({
  month,
  tasks,
  today,
  query,
}: {
  month: string;
  tasks: TaskRow[];
  today: string;
  query: string; // filtros atuais, mantidos ao trocar de mês
}) {
  const href = (m: string) =>
    `/tarefas/calendario?${[query, `mes=${m}`].filter(Boolean).join("&")}`;
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const byDay = Map.groupBy(
    tasks.filter((t) => t.dueDate),
    (t) => t.dueDate!,
  );
  return (
    <div className="p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-h3 capitalize">{title}</h2>
        <span className="flex-1" />
        <Link
          href={href(shiftMonth(month, -1))}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Mês anterior"
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
        <Link
          href={href(today.slice(0, 7))}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Hoje
        </Link>
        <Link
          href={href(shiftMonth(month, 1))}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Próximo mês"
        >
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <ol className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-md border bg-border gap-px">
          {WEEKDAYS.map((d) => (
            <li
              key={d}
              aria-hidden="true"
              className="bg-surface px-2 py-1 text-xs font-medium text-muted"
            >
              {d}
            </li>
          ))}
          {monthGrid(month).map((day) => {
            const list = byDay.get(day) ?? [];
            const outside = !day.startsWith(month);
            return (
              <li
                key={day}
                aria-label={new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
                className={cn("min-h-24 bg-surface p-1.5", outside && "bg-base")}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    day === today
                      ? "bg-accent-solid font-semibold text-on-accent"
                      : outside && "text-muted",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                <ul className="mt-1 flex flex-col gap-1">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/tarefas/${t.number}`}
                        className={cn(
                          "flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs hover:bg-muted",
                          t.category === "done" && "text-muted line-through",
                          t.category !== "done" && day < today && "border-l-2 border-err",
                        )}
                        title={`TI-${t.number} ${t.title}`}
                      >
                        <PriorityIcon priority={t.priority} className="size-3" />
                        <span className="truncate">{t.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
