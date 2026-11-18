import { Calendar, ListChecks } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { isOverdue, shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/server/services/tasks";
import { LabelChip, PersonalMark, PriorityIcon, ProjectChip, UnitChip } from "./badges";

/** Prazo com ícone; vencido em `err` (ícone) e texto normal (contraste). */
export function DueDate({
  due,
  time,
  overdue,
}: {
  due: string;
  time?: string | null;
  overdue: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
      <Calendar
        className={cn("size-3.5", overdue && "text-err")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {shortDate(due)}
      {time && ` ${time}`}
      {overdue && <span className="sr-only">(vencida)</span>}
    </span>
  );
}

/** Módulo 16: "2/5" das subtarefas; todas concluídas, o ícone fica em `ok` (só o ícone). */
function ChecklistProgress({ done, total }: { done: number; total: number }) {
  return (
    <span
      role="img"
      aria-label={`${done} de ${total} subtarefas concluídas`}
      className="inline-flex items-center gap-1 text-xs tabular-nums text-muted"
    >
      <ListChecks
        className={cn("size-4", done === total && "text-ok")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span aria-hidden="true">
        {done}/{total}
      </span>
    </span>
  );
}

/** TaskCard do Design System: ID, título, chips e rodapé com prazo, prioridade e responsável. */
export function TaskCard({
  task,
  className,
}: {
  task: TaskRow;
  /** ponytail: não usado desde o ADR-072 (o atraso vem do isOverdue); quem chama ainda passa */
  today?: string;
  className?: string;
}) {
  const overdue = task.category !== "done" && isOverdue(task.dueDate, task.dueTime);
  return (
    <article className={cn("rounded-md border bg-surface p-3 shadow-1", className)}>
      <Link href={`/tarefas/${task.number}`} className="text-sm font-medium hover:underline">
        <span className="mr-1.5 text-xs text-muted tabular-nums">TI-{task.number}</span>
        {task.title}
      </Link>
      {task.visibility === "personal" && <PersonalMark className="ml-1.5 align-middle" />}
      {(task.projects.length > 0 || task.units.length > 0 || task.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.projects.map((p) => (
            <ProjectChip key={p.id} code={p.code} name={p.name} color={p.color} />
          ))}
          {task.units.map((u) => (
            <UnitChip key={u.code} code={u.code} color={u.color} />
          ))}
          {task.labels.map((l) => (
            <LabelChip key={l.name} name={l.name} colorToken={l.colorToken} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <PriorityIcon priority={task.priority} />
        {task.dueDate && <DueDate due={task.dueDate} time={task.dueTime} overdue={overdue} />}
        {task.checklistTotal > 0 && (
          <ChecklistProgress done={task.checklistDone} total={task.checklistTotal} />
        )}
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
