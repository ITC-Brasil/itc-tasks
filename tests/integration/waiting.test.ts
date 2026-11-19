import { and, eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { notifications, taskEvents, tasks } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { daily } from "@/server/services/notifications";
import {
  bulkUpdateTasks,
  completeTask,
  createTask,
  firstStatus,
  listTasks,
  moveTask,
  updateTask,
} from "@/server/services/tasks";

// ADR-078
type Person = Extract<Actor, { kind: "user" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let ana: Person;
let projectId: string;
let waitingId: string;
let todoId: string;
const today = todayISO();
const ok = { waitingReason: "purchase" as const, waitingUntil: addDays(today, 3) };

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Espera",
    email: `espera-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  ana = { kind: "user", userId: u.id, role: "member" };
  projectId = (await createProject(system, { code: `AG${run}`, name: `Ag ${run}`, kind: "client" }))
    .id;
  [waitingId, todoId] = await db.transaction(async (tx) => [
    (await firstStatus(tx, "waiting")).id,
    (await firstStatus(tx, "todo")).id,
  ]);
});

const fresh = () =>
  createTask(ana, { title: `Espera ${run}`, projectIds: [projectId], assigneeId: ana.userId });

it("exige motivo e previsão em todas as entradas: detalhe, Kanban, massa e criação", async () => {
  const t = await fresh();
  const need = { code: "VALIDATION" };
  await expect(updateTask(ana, t.id, { statusId: waitingId })).rejects.toMatchObject(need);
  await expect(
    moveTask(ana, t.id, { statusId: waitingId }),
  ).rejects.toMatchObject(need);
  await expect(
    bulkUpdateTasks(ana, { taskIds: [t.id], patch: { statusId: waitingId } }),
  ).rejects.toMatchObject(need);
  await expect(
    createTask(ana, { title: "x", projectIds: [projectId], statusId: waitingId }),
  ).rejects.toMatchObject(need);
  // "Outro" sem texto, data passada, campos fora do Aguardando
  await expect(
    updateTask(ana, t.id, { statusId: waitingId, ...ok, waitingReason: "other" }),
  ).rejects.toMatchObject(need);
  await expect(
    updateTask(ana, t.id, { statusId: waitingId, ...ok, waitingUntil: addDays(today, -1) }),
  ).rejects.toMatchObject(need);
  await expect(updateTask(ana, t.id, ok)).rejects.toMatchObject(need);

  const moved = await moveTask(ana, t.id, { statusId: waitingId, ...ok });
  expect(moved).toMatchObject({ waitingReason: "purchase", waitingUntil: ok.waitingUntil });
  const other = await fresh();
  const [bulk] = await bulkUpdateTasks(ana, {
    taskIds: [other.id],
    patch: {
      statusId: waitingId,
      waitingReason: "other",
      waitingNote: "Peça",
      waitingUntil: today,
    },
  });
  expect(bulk).toMatchObject({ waitingReason: "other", waitingNote: "Peça" });
});

it("sair limpa os campos e o histórico guarda o que eram; editar dentro grava evento", async () => {
  const t = await fresh();
  await updateTask(ana, t.id, { statusId: waitingId, ...ok });
  await updateTask(ana, t.id, { waitingReason: "client" });
  const back = await updateTask(ana, t.id, { statusId: todoId });
  expect(back).toMatchObject({ waitingReason: null, waitingNote: null, waitingUntil: null });
  const done = await fresh();
  await updateTask(ana, done.id, { statusId: waitingId, ...ok });
  expect(await completeTask(ana, done.id)).toMatchObject({ waitingReason: null });

  const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, t.id));
  const left = events.find(
    (e) =>
      e.type === "status_changed" && (e.payload as { waitingCleared?: unknown }).waitingCleared,
  );
  expect((left!.payload as { waitingCleared: object }).waitingCleared).toMatchObject({
    waitingReason: "client",
  });
  const texts = (await listActivity(ana, t.id)).map((a) => a.text);
  expect(texts.some((x) => x.includes("(Compra, previsão"))).toBe(true);
  expect(texts.some((x) => x.startsWith("mudou o Aguardando para Cliente"))).toBe(true);
});

it("legado sem campos continua; completar exige o par", async () => {
  const t = await fresh();
  await db.update(tasks).set({ statusId: waitingId }).where(eq(tasks.id, t.id));
  // mexer em outra coisa não obriga a preencher
  await expect(updateTask(ana, t.id, { priority: "high" })).resolves.toBeTruthy();
  await expect(updateTask(ana, t.id, { waitingReason: "supplier" })).rejects.toMatchObject({
    code: "VALIDATION",
  });
  const filled = await updateTask(ana, t.id, { waitingReason: "supplier", waitingUntil: today });
  expect(filled.waitingUntil).toBe(today);
});

it("filtro por motivo e lembrete na data prevista (uma vez por dia)", async () => {
  const t = await fresh();
  await updateTask(ana, t.id, {
    statusId: waitingId,
    waitingReason: "third_party",
    waitingUntil: today,
  });
  const { tasks: rows } = await listTasks(ana, { waitingReasons: ["third_party"] });
  expect(rows.some((r) => r.id === t.id)).toBe(true);
  expect(rows.every((r) => r.waitingReason === "third_party")).toBe(true);

  await daily();
  await daily();
  const sent = await db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.taskId, t.id), sql`${notifications.data}->>'waiting' = 'Terceiro'`),
    );
  expect(sent).toHaveLength(1);
  expect(sent[0].event).toBe("due_today");
});
