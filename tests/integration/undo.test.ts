import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { taskEvents, tasks } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  UNDO_STALE,
  completeTask,
  createTask,
  firstStatus,
  lastStatusEventId,
  moveTask,
  undoStatusChange,
  updateTask,
} from "@/server/services/tasks";

// ADR-082
type Person = Extract<Actor, { kind: "user" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let ana: Person, bia: Person;
let projectId: string, todoId: string, waitingId: string;

const member = async (name: string): Promise<Person> => {
  const u = await createMember(system, {
    name,
    email: `${name}-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user", userId: u.id, role: "member" };
};

beforeAll(async () => {
  [ana, bia] = [await member("desfaz-ana"), await member("desfaz-bia")];
  projectId = (await createProject(system, { code: `DF${run}`, name: `Df ${run}`, kind: "client" }))
    .id;
  [todoId, waitingId] = await db.transaction(async (tx) => [
    (await firstStatus(tx, "todo")).id,
    (await firstStatus(tx, "waiting")).id,
  ]);
});

const fresh = () =>
  createTask(ana, { title: `Desfazer ${run}`, projectIds: [projectId], statusId: todoId });
const statusEvents = (taskId: string) =>
  db
    .select({ id: taskEvents.id })
    .from(taskEvents)
    .where(and(eq(taskEvents.taskId, taskId), eq(taskEvents.type, "status_changed")));

it("desfaz a conclusão com evento novo, sem apagar o original", async () => {
  const t = await fresh();
  await completeTask(ana, t.id);
  const eventId = (await lastStatusEventId(ana, t.id))!;
  const back = await undoStatusChange(ana, t.id, eventId);
  expect(back.statusId).toBe(todoId);
  expect(back.completedAt).toBeNull();
  expect(await statusEvents(t.id)).toHaveLength(2);
});

it("restaura motivo, texto e previsão do Aguardando, mesmo com a previsão vencida", async () => {
  const t = await fresh();
  await moveTask(ana, t.id, {
    statusId: waitingId,
    waitingReason: "other",
    waitingNote: "fornecedor",
    waitingUntil: addDays(todayISO(), 2),
  });
  const past = addDays(todayISO(), -3);
  await db.update(tasks).set({ waitingUntil: past }).where(eq(tasks.id, t.id));
  await completeTask(ana, t.id);
  const back = await undoStatusChange(ana, t.id, (await lastStatusEventId(ana, t.id))!);
  expect(back).toMatchObject({
    statusId: waitingId,
    waitingReason: "other",
    waitingNote: "fornecedor",
    waitingUntil: past,
  });
});

it("recusa quando a tarefa mudou depois, ou quando o evento é de outra pessoa", async () => {
  const t = await fresh();
  await completeTask(ana, t.id);
  const eventId = (await lastStatusEventId(ana, t.id))!;
  await expect(undoStatusChange(bia, t.id, eventId)).rejects.toThrow("Nada a desfazer");
  await updateTask(bia, t.id, { priority: "high" });
  await expect(undoStatusChange(ana, t.id, eventId)).rejects.toThrow(UNDO_STALE);
  await expect(undoStatusChange(ana, t.id, eventId)).rejects.toThrow(UNDO_STALE);
});

it("agente não desfaz", async () => {
  const t = await fresh();
  await completeTask(ana, t.id);
  const eventId = (await lastStatusEventId(ana, t.id))!;
  const agent: Actor = {
    kind: "agent",
    userId: ana.userId,
    apiKeyId: "x",
    role: "member",
  } as Actor;
  await expect(undoStatusChange(agent, t.id, eventId)).rejects.toThrow();
});
