import { dueKey } from "./dates";
import { PRIORITIES, type Priority } from "./validation/tasks";

export type KanbanSortable = {
  number: number;
  priority: Priority;
  category: string;
  dueDate: string | null;
  dueTime: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
};

const time = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);

/**
 * ADR-081: ordem calculada da coluna do Kanban. `done`: concluída mais recente primeiro. Demais:
 * prazo crescente (sem hora = fim do dia; sem prazo no fim), prioridade maior, criada mais
 * recente, número.
 */
export function compareKanban(a: KanbanSortable, b: KanbanSortable) {
  if (a.category === "done" && b.category === "done")
    return time(b.completedAt) - time(a.completedAt) || b.number - a.number;
  return (
    dueKey(a.dueDate, a.dueTime).localeCompare(dueKey(b.dueDate, b.dueTime)) ||
    PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) ||
    time(b.createdAt) - time(a.createdAt) ||
    b.number - a.number
  );
}
