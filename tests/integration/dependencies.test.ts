import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { notifications, taskEvents } from "@/db/schema";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import { getTaskDetail } from "@/server/services/agents";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { fanout } from "@/server/services/notifications";
import {
  addLink,
  completeTask,
  createTask,
  deleteTasks,
  getTaskByNumber,
  listTasks,
  removeLink,
  updateTask,
} from "@/server/services/tasks";

// ADR-079
type Person = Extract<Actor, { kind: "user" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let ana: Person, bia: Person;
let projectId: string;

const person = async (name: string): Promise<Person> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-d${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user", userId: u.id, role: "member" };
};
const team = (title: string, assigneeId?: string) =>
  createTask(ana, { title: `${title} ${run}`, projectIds: [projectId], assigneeId });

beforeAll(async () => {
  [ana, bia] = [await person("Dep"), await person("Bloq")];
  projectId = (
    await createProject(system, { code: `DP${run}`, name: `Dep ${run}`, kind: "client" })
  ).id;
});

it("bloqueada por: eventos nos dois lados, sem ciclo nem auto-dependência", async () => {
  const [a, b, c] = [await team("A"), await team("B"), await team("C")];
  await addLink(ana, a.id, { kind: "blocked_by", target: b.number }); // B bloqueia A
  await addLink(ana, b.id, { kind: "blocked_by", target: c.number }); // C bloqueia B
  await expect(addLink(ana, c.id, { kind: "blocked_by", target: a.number })).rejects.toMatchObject({
    code: "VALIDATION",
  });
  await expect(addLink(ana, b.id, { kind: "blocks", target: c.number })).rejects.toMatchObject({
    code: "VALIDATION",
  });
  await expect(addLink(ana, a.id, { kind: "blocked_by", target: a.number })).rejects.toMatchObject({
    code: "VALIDATION",
  });

  const detail = await getTaskByNumber(ana, b.number);
  expect(detail!.links.map((l) => [l.kind, l.number]).sort()).toEqual([
    ["blocked_by", c.number],
    ["blocks", a.number],
  ]);
  expect((await listActivity(ana, a.id)).at(-1)!.text).toBe(`ficou bloqueada por TI-${b.number}`);
  expect(
    (await listActivity(ana, b.id)).some((x) => x.text === `passou a bloquear TI-${a.number}`),
  ).toBe(true);

  const { tasks: blocked } = await listTasks(ana, { blocked: ["1"], projectIds: [projectId] });
  expect(blocked.map((t) => t.number).sort()).toEqual([a.number, b.number].sort());

  const mcp = await getTaskDetail(ana, b.number);
  expect(mcp.blockedBy).toEqual([{ id: `TI-${c.number}`, title: c.title, done: false }]);
  expect(mcp.blocks.map((x) => x.id)).toEqual([`TI-${a.number}`]);

  await removeLink(ana, a.id, { kind: "blocked_by", target: b.number });
  expect((await listActivity(ana, b.id)).at(-1)!.text).toBe(`deixou de bloquear TI-${a.number}`);
});

it("concluir a última bloqueadora avisa o responsável; não impede mover a bloqueada", async () => {
  const blocked = await team("Bloqueada", bia.userId);
  const [x, y] = [await team("X"), await team("Y")];
  await addLink(ana, blocked.id, { kind: "blocked_by", target: x.number });
  await addLink(ana, blocked.id, { kind: "blocked_by", target: y.number });
  // dependência só avisa: a bloqueada pode ser concluída mesmo assim
  const other = await team("Livre", bia.userId);
  await addLink(ana, other.id, { kind: "blocked_by", target: x.number });
  await expect(completeTask(ana, other.id)).resolves.toBeTruthy();

  const unblocked = async () =>
    db
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, blocked.id), eq(taskEvents.type, "unblocked")));
  await completeTask(ana, x.id);
  expect(await unblocked()).toHaveLength(0); // Y ainda aberta
  await completeTask(ana, y.id);
  const [ev] = await unblocked();
  expect(ev.payload).toEqual({ by: y.number });
  await fanout([ev.id]);
  const [n] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.taskId, blocked.id), eq(notifications.userId, bia.userId)));
  expect(n).toMatchObject({ event: "status_changed", data: { unblockedBy: `TI-${y.number}` } });
});

it("pessoal × equipe: recusa sem vazar; pessoal de outra pessoa não existe", async () => {
  const mine = await createTask(ana, {
    title: `Minha ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  const mine2 = await createTask(ana, {
    title: `Minha 2 ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  const theirs = await createTask(bia, {
    title: `Dela ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  const t = await team("Equipe");
  await expect(
    addLink(ana, t.id, { kind: "blocked_by", target: mine.number }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  const err = await addLink(ana, t.id, { kind: "blocked_by", target: theirs.number }).catch(
    (e) => e,
  );
  expect(err).toMatchObject({ code: "NOT_FOUND", message: `TI-${theirs.number} não encontrada` });
  const err2 = await addLink(ana, mine.id, { kind: "blocked_by", target: theirs.number }).catch(
    (e) => e,
  );
  expect(err2).toMatchObject({ code: "NOT_FOUND" });

  // entre pessoais do mesmo dono vale; aí mover para a equipe é recusado
  await addLink(ana, mine.id, { kind: "blocked_by", target: mine2.number });
  await expect(
    updateTask(ana, mine.id, { visibility: "team", projectIds: [projectId] }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  // a outra pessoa não vê nada da dependência pessoal
  expect(await getTaskByNumber(bia, mine.number)).toBeNull();
});

it("excluir leva a dependência e registra no outro lado", async () => {
  const [gone, stays] = [await team("Some"), await team("Fica")];
  await addLink(ana, stays.id, { kind: "blocked_by", target: gone.number });
  await deleteTasks(ana, { taskIds: [gone.id] });
  const detail = await getTaskByNumber(ana, stays.number);
  expect(detail!.links).toEqual([]);
  expect((await listActivity(ana, stays.id)).at(-1)!.text).toBe(
    `deixou de depender de TI-${gone.number}, que foi excluída`,
  );
});
