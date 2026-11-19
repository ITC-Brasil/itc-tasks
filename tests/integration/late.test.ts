import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { addDays, todayISO } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  completeTask,
  countLate,
  createTask,
  firstStatus,
  listTasks,
  moveTask,
} from "@/server/services/tasks";

// Módulo 18, item 11
type Person = Extract<Actor, { kind: "user" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let me: Person, other: Person, projectId: string, waitingId: string;

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
  [me, other] = [await member("atraso-me"), await member("atraso-outra")];
  projectId = (await createProject(system, { code: `AT${run}`, name: `At ${run}`, kind: "client" }))
    .id;
  waitingId = await db.transaction(async (tx) => (await firstStatus(tx, "waiting")).id);
});

it("conta minhas (com pessoais) e da equipe; fora Concluído, Aguardando e pessoal alheia", async () => {
  const before = { me: await countLate(me), other: await countLate(other) };
  const yesterday = addDays(todayISO(), -1);
  const team = (title: string, assigneeId = me.userId) =>
    createTask(me, { title, projectIds: [projectId], assigneeId, dueDate: yesterday });
  const late = await team(`late ${run}`);
  await team(`late outra ${run}`, other.userId);
  await createTask(me, { title: "p", projectIds: [], visibility: "personal", dueDate: yesterday });
  await createTask(other, {
    title: "p",
    projectIds: [],
    visibility: "personal",
    dueDate: yesterday,
  });
  await completeTask(me, (await team(`feita ${run}`)).id);
  await moveTask(me, (await team(`espera ${run}`)).id, {
    statusId: waitingId,
    waitingReason: "purchase",
    waitingUntil: addDays(todayISO(), 2),
  });
  await createTask(me, { title: "sem", projectIds: [projectId], assigneeId: me.userId });

  const now = await countLate(me);
  expect(now.mine - before.me.mine).toBe(2); // a da equipe e a pessoal
  expect(now.team - before.me.team).toBe(2); // as duas da equipe, sem pessoal
  expect((await countLate(other)).team - before.other.team).toBe(2);

  const { tasks } = await listTasks(me, { overdue: ["1"], projectIds: [projectId] });
  expect(tasks.map((t) => t.id)).toContain(late.id);
  expect(tasks.every((t) => t.title.startsWith("late"))).toBe(true);
});
