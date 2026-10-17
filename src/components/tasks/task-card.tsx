import { Calendar } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/server/services/tasks";
import { LabelChip, PriorityIcon, ProjectChip, UnitChip } from "./badges";

/** Prazo com ícone; vencido em `err` (ícone) e texto normal (contraste). */
export function DueDate({ due, overdue }: { due: string; overdue: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
      <Calendar
        className={cn("size-3.5", overdue && "text-err")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {shortDate(due)}
      {overdue && <span className="sr-only">(vencida)</span>}
    </span>
  );
}

/** TaskCard do Design System: ID, título, chips e rodapé com prazo, prioridade e responsável. */
export function TaskCard({
  task,
  today,
  className,
}: {
  task: TaskRow;
  today: string;
  className?: string;
}) {
  const overdue = !!task.dueDate && task.dueDate < today && task.category !== "done";
  return (
    <article className={cn("rounded-md border bg-surface p-3 shadow-1", className)}>
      <Link href={`/tarefas/${task.number}`} className="text-sm font-medium hover:underline">
        <span className="mr-1.5 text-xs text-muted tabular-nums">TI-{task.number}</span>
        {task.title}
      </Link>
      {(task.projects.length > 0 || task.units.length > 0 || task.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.projects.map((p) => (
            <ProjectChip key={p.id} code={p.code} name={p.name} />
          ))}
          {task.units.map((u) => (
            <UnitChip key={u} code={u} />
          ))}
          {task.labels.map((l) => (
            <LabelChip key={l.name} name={l.name} colorToken={l.colorToken} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <PriorityIcon priority={task.priority} />
        {task.dueDate && <DueDate due={task.dueDate} overdue={overdue} />}
        <span className="flex-1" />
        {task.assigneeInitials && (
          <span title={task.assigneeName ?? undefined}>
            <Avatar initials={task.assigneeInitials} />
          </span>
        )}
      </div>
    </article>
  );
}
