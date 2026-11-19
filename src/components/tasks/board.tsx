"use client";

import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compareKanban } from "@/lib/kanban-order";
import { cn } from "@/lib/utils";
import { moveTaskAction } from "@/server/actions/tasks";
import type { TaskRow } from "@/server/services/tasks";
import { type Category, StatusIcon } from "./badges";
import { openQuickCreate } from "./quick-create";
import { statusToast } from "./status-toast";
import { TaskCard } from "./task-card";
import { useWaitingPrompt } from "./waiting";

type Status = { id: string; name: string; category: Category };
type Columns = Record<string, TaskRow[]>; // formato do `move` do @dnd-kit/helpers

// ADR-081: a ordem da coluna é calculada (compareKanban), nunca a do arraste
const group = (statuses: Status[], tasks: TaskRow[]): Columns =>
  Object.fromEntries(
    statuses.map((s) => [s.id, tasks.filter((t) => t.statusId === s.id).sort(compareKanban)]),
  );

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
  // Módulo 18: no Concluído o card é compacto; o chevron expande (estado só local)
  const [expanded, setExpanded] = useState(false);
  const done = task.category === "done";
  const Chevron = expanded ? ChevronUp : ChevronDown;
  // alça própria: o card tem link e não pode ser ele mesmo um botão (axe nested-interactive)
  return (
    <li ref={ref} className="relative">
      <TaskCard
        task={task}
        today={today}
        compact={done && !expanded}
        className={cn(done ? "pr-14" : "pr-8", isDragging && "rotate-[1.5deg] shadow-2")}
      />
      {done && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Recolher" : "Expandir"} TI-${task.number}`}
          onClick={() => setExpanded(!expanded)}
          className="absolute top-2 right-8 rounded-sm p-1 text-muted hover:bg-muted"
        >
          <Chevron className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
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

function Column({
  status,
  tasks,
  today,
  olderDoneHref,
}: {
  status: Status;
  tasks: TaskRow[];
  today: string;
  olderDoneHref?: string;
}) {
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
        "flex w-72 flex-none snap-center flex-col rounded-lg border bg-base max-md:w-[calc(100vw-2rem)]",
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
      {/* Módulo 18: o Kanban só traz as concluídas dos últimos 14 dias */}
      {status.category === "done" && olderDoneHref && (
        <Link href={olderDoneHref} className="mx-3 mb-3 text-sm text-accent-text hover:underline">
          Ver concluídas anteriores
        </Link>
      )}
      {/* ADR-078: no Aguardando a tarefa entra arrastando (com motivo e previsão) */}
      {status.category !== "waiting" && (
        <Button
          variant="ghost"
          size="sm"
          className="m-2 mt-0 justify-start text-muted"
          onClick={() => openQuickCreate({ statusId: status.id })}
        >
          <Plus aria-hidden="true" /> Nova tarefa
        </Button>
      )}
    </section>
  );
}

/** PRD V2: colunas por status; arrastar move na hora e desfaz se o servidor recusar (ADR-046). */
export function Board({
  statuses,
  tasks,
  today,
  olderDoneHref,
}: {
  statuses: Status[];
  tasks: TaskRow[];
  today: string;
  olderDoneHref?: string; // pé da coluna Concluído: Lista com as concluídas
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
  const [askWaiting, waitingDialog] = useWaitingPrompt();
  const categoryOf = (id: string) => statuses.find((s) => s.id === id)?.category;

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
        // ADR-081: dentro da mesma coluna não reordena; o card volta à posição calculada
        if (from.statusId === to.statusId) return setColumns(before);
        const target = statuses.find((s) => s.id === to.statusId)!;
        const moved = {
          ...to.list[to.index],
          statusId: target.id,
          category: target.category,
          completedAt: target.category === "done" ? new Date() : null,
        };
        setColumns(
          group(statuses, [
            ...Object.values(before)
              .flat()
              .filter((t) => t.id !== id),
            moved,
          ]),
        );
        void (async () => {
          // ADR-078: entrar no Aguardando pede motivo e previsão; cancelar devolve o card
          const entering =
            categoryOf(to.statusId) === "waiting" && categoryOf(from.statusId) !== "waiting";
          const waiting = entering ? await askWaiting() : {};
          if (!waiting) return setColumns(before);
          const r = await moveTaskAction(id, { statusId: to.statusId, ...waiting });
          if (r.ok) {
            statusToast(router, {
              taskId: id,
              number: moved.number,
              statusName: target.name,
              done: target.category === "done" && categoryOf(from.statusId) !== "done",
              eventId: r.data,
            });
            return router.refresh();
          }
          setColumns(before);
          toast.error(r.error);
        })();
      }}
    >
      {waitingDialog}
      {/* < 768 px: uma coluna por vez, com snap (UI.md §6) */}
      <div className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto p-4 md:snap-none md:p-6">
        {statuses.map((s) => (
          <Column
            key={s.id}
            status={s}
            tasks={Reflect.get(columns, s.id) ?? []}
            today={today}
            olderDoneHref={olderDoneHref}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
