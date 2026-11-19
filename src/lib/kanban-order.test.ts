import { expect, it } from "vitest";
import { compareKanban, type KanbanSortable } from "./kanban-order";

const t = (number: number, over: Partial<KanbanSortable> = {}): KanbanSortable => ({
  number,
  priority: "none",
  category: "todo",
  dueDate: null,
  dueTime: null,
  createdAt: "2026-11-01T12:00:00Z",
  completedAt: null,
  ...over,
});
const order = (list: KanbanSortable[]) => list.toSorted(compareKanban).map((x) => x.number);

it("prazo crescente; com hora antes do mesmo dia sem hora; sem prazo no fim", () => {
  expect(
    order([
      t(1),
      t(2, { dueDate: "2026-11-20" }),
      t(3, { dueDate: "2026-11-10" }),
      t(4, { dueDate: "2026-11-20", dueTime: "09:00" }),
    ]),
  ).toEqual([3, 4, 2, 1]);
});

it("mesmo prazo: prioridade maior primeiro, depois criada mais recente, depois número", () => {
  const due = { dueDate: "2026-11-20" };
  expect(
    order([
      t(1, { ...due, priority: "low" }),
      t(2, { ...due, priority: "urgent" }),
      t(3, { ...due, priority: "low", createdAt: "2026-11-05T12:00:00Z" }),
      t(4, { ...due, priority: "low", createdAt: "2026-11-05T12:00:00Z" }),
    ]),
  ).toEqual([2, 4, 3, 1]);
});

it("sem prazo: prioridade e depois criada mais recente", () => {
  expect(
    order([t(1), t(2, { priority: "high" }), t(3, { createdAt: "2026-11-09T00:00:00Z" })]),
  ).toEqual([2, 3, 1]);
});

it("concluídas: concluída mais recente primeiro, ignorando prazo", () => {
  const done = { category: "done" };
  expect(
    order([
      t(1, { ...done, completedAt: "2026-11-10T00:00:00Z", dueDate: "2026-01-01" }),
      t(2, { ...done, completedAt: "2026-11-12T00:00:00Z" }),
    ]),
  ).toEqual([2, 1]);
});
