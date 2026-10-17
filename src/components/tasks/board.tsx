"use client";

import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveTaskAction } from "@/server/actions/tasks";
import type { TaskRow } from "@/server/services/tasks";
import { type Category, StatusIcon } from "./badges";
import { openQuickCreate } from "./quick-create";
import { TaskCard } from "./task-card";

type Status = { id: string; name: string; category: Category };
type Columns = Record<string, TaskRow[]>; // formato do `move` do @dnd-kit/helpers

const group = (statuses: Status[], tasks: TaskRow[]): Columns =>
  Object.fromEntries(statuses.map((s) => [s.id, tasks.filter((t) => t.statusId === s.id)]));

function Card({
  task,
  index,
  column,
  today,
}: {
  task: TaskRow;
  index: number;
  column: string;
  today: string;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: task.id,
    index,
    group: column,
    type: "task",
    accept: "task",
  });
  // alça própria: o card tem link e não pode ser ele mesmo um botão (axe nested-interactive)
  return (
    <li ref={ref} className="relative">
      <TaskCard
        task={task}
        today={today}
        className={cn("pr-8", isDragging && "rotate-[1.5deg] shadow-2")}
      />
      <button
        ref={handleRef}
        type="button"
        aria-label={`Mover TI-${task.number}`}
        className="absolute top-2 right-1.5 cursor-grab rounded-sm p-1 text-muted hover:bg-muted"
      >
        <GripVertical className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </li>
  );
}

function Column({ status, tasks, today }: { status: Status; tasks: TaskRow[]; today: string }) {
  const { ref, isDropTarget } = useDroppable({
    id: status.id,
    type: "column",
    accept: "task",
    collisionPriority: 0, // os cards têm prioridade; a coluna pega o espaço vazio
  });
  return (
    <section
      aria-label={status.name}
      className={cn(
        "flex w-72 flex-none flex-col rounded-lg border bg-base",
        isDropTarget && "border-accent",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <StatusIcon category={status.category} />
        <h2 className="text-sm font-semibold">{status.name}</h2>
        <span className="text-xs text-muted tabular-nums" aria-label={`${tasks.length} tarefas`}>
          {tasks.length}
        </span>
      </header>
      <ul ref={ref} className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
        {tasks.map((t, i) => (
          <Card key={t.id} task={t} index={i} column={status.id} today={today} />
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="m-2 mt-0 justify-start text-muted"
        onClick={() => openQuickCreate({ statusId: status.id })}
      >
        <Plus aria-hidden="true" /> Nova tarefa
      </Button>
    </section>
  );
}

/** PRD V2: colunas por status; arrastar move na hora e desfaz se o servidor recusar (ADR-046). */
export function Board({
  statuses,
  tasks,
  today,
}: {
  statuses: Status[];
  tasks: TaskRow[];
  today: string;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(() => group(statuses, tasks));
  // dados novos do servidor (filtro, refresh) substituem o estado local
  const [fromServer, setFromServer] = useState(tasks);
  if (fromServer !== tasks) {
    setFromServer(tasks);
    setColumns(group(statuses, tasks));
  }
  const snapshot = useRef(columns);

  return (
    <DragDropProvider
      onDragStart={() => {
        snapshot.current = columns;
      }}
      // o estado acompanha o arraste entre colunas; senão o React e o DOM do dnd-kit divergem
      onDragOver={(event) => setColumns((c) => move(c, event))}
      onDragEnd={(event) => {
        const before = snapshot.current;
        const { source } = event.operation;
        if (event.canceled || !source) return setColumns(before);
        const after = move(columns, event);
        const id = String(source.id);
        const where = (c: Columns) => {
          for (const [statusId, list] of Object.entries(c)) {
            const index = list.findIndex((t) => t.id === id);
            if (index >= 0) return { statusId, index, list };
          }
          throw new Error("card fora do quadro");
        };
        const [from, to] = [where(before), where(after)];
        if (from.statusId === to.statusId && from.index === to.index) return;
        setColumns(after);
        const afterTaskId = to.index > 0 ? to.list[to.index - 1].id : null;
        moveTaskAction(id, { statusId: to.statusId, afterTaskId }).then((r) => {
          if (r.ok) return router.refresh();
          setColumns(before);
          toast.error(r.error);
        });
      }}
    >
      <div className="flex flex-1 gap-3 overflow-x-auto p-4 md:p-6">
        {statuses.map((s) => (
          <Column key={s.id} status={s} tasks={Reflect.get(columns, s.id) ?? []} today={today} />
        ))}
      </div>
    </DragDropProvider>
  );
}
