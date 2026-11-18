import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { notifications, taskEvents, taskRecurrenceRuns, taskRecurrences, tasks } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import { createProject } from "@/server/services/catalog";
import { createMember, setMemberActive } from "@/server/services/members";
import { fanout } from "@/server/services/notifications";
import {
  dailyRecurrences,
  deleteRecurrence,
  listRecurrences,
  runRecurrence,
  saveRecurrence,
  setRecurrencePaused,
} from "@/server/services/recurrences";
import { getTaskByNumber, listTasks } from "@/server/services/tasks";

// ADR-077
type Person = Extract<Actor, { kind: "user" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let owner: Person, other: Person;
let projectId: string;

const person = async (name: string): Promise<Person> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-r${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user", userId: u.id, role: "member" };
};

const base = (over: Record<string, unknown> = {}) => ({
  name: `Backup ${run}`,
  frequency: "weekdays" as const,
  startDate: "2020-01-01",
  dueInDays: 2,
  dueTime: "17:00",
  payload: {
    title: `Backup semanal ${run}`,
    projectIds: [projectId],
    assigneeId: owner.userId,
    checklist: ["Conferir log"],
  },
  ...over,
});

/** Simula regra criada há tempos: o piso (updated_at) fica no passado. */
const age = (id: string) =>
  db
    .update(taskRecurrences)
    .set({ updatedAt: new Date("2020-01-01T12:00:00Z") })
    .where(eq(taskRecurrences.id, id));

const runsOf = (id: string) =>
  db.select().from(taskRecurrenceRuns).where(eq(taskRecurrenceRuns.recurrenceId, id));

beforeAll(async () => {
  [owner, other] = [await person("Rotina"), await person("Colega")];
  projectId = (
    await createProject(system, { code: `RC${run}`, name: `Rec ${run}`, kind: "client" })
  ).id;
});

it("cria a ocorrência de hoje na hora, com ator automação, criador = dono e prazo relativo", async () => {
  const monday = new Date("2026-11-16T12:00:00Z");
  const rule = await saveRecurrence(owner, null, base({ startDate: "2026-11-16" }));
  // a criação usa o relógio real; aqui forçamos uma data conhecida
  await db.delete(taskRecurrenceRuns).where(eq(taskRecurrenceRuns.recurrenceId, rule.id));
  await db.delete(tasks).where(eq(tasks.recurrenceId, rule.id));
  await age(rule.id);
  const task = await runRecurrence(rule.id, monday);
  expect(task).toMatchObject({
    creatorId: owner.userId,
    assigneeId: owner.userId,
    createdVia: "automation",
    dueDate: "2026-11-18",
    dueTime: "17:00",
    recurrenceId: rule.id,
  });
  // idempotente: a mesma data não cria outra
  expect(await runRecurrence(rule.id, monday)).toBeNull();
  expect(await runsOf(rule.id)).toHaveLength(1);

  const detail = await getTaskByNumber(owner, task!.number);
  expect(detail!.checklist.map((c) => c.text)).toEqual(["Conferir log"]);
  const activity = await listActivity(owner, task!.id);
  expect(activity[0]).toMatchObject({
    actor: "Automação",
    text: `criou a tarefa pela recorrência “Backup ${run}”`,
  });
  // fanout normal: o responsável recebe "assigned"
  const [ev] = await db.select().from(taskEvents).where(eq(taskEvents.taskId, task!.id));
  await fanout([ev.id]);
  const n = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.taskId, task!.id), eq(notifications.userId, owner.userId)));
  expect(n.map((r) => r.event)).toEqual(["assigned"]);
});

it("worker parado: ao voltar cria só a mais recente pendente; a anterior aberta não impede", async () => {
  const rule = await saveRecurrence(owner, null, base({ name: `Parado ${run}` }));
  await db.delete(taskRecurrenceRuns).where(eq(taskRecurrenceRuns.recurrenceId, rule.id));
  await db.delete(tasks).where(eq(tasks.recurrenceId, rule.id));
  await age(rule.id);
  await runRecurrence(rule.id, new Date("2026-11-02T12:00:00Z")); // segunda
  // parado de terça a domingo; volta na segunda seguinte (03:00 UTC = 00:00 de Brasília)
  const back = await runRecurrence(rule.id, new Date("2026-11-09T03:30:00Z"));
  expect(back!.dueDate).toBe("2026-11-11");
  expect((await runsOf(rule.id)).map((r) => r.runOn).sort()).toEqual(["2026-11-02", "2026-11-09"]);
});

it("fuso: 01:00 UTC ainda é o dia anterior em Brasília", async () => {
  expect(todayISO(new Date("2026-11-21T01:00:00Z"))).toBe("2026-11-20");
});

it("pausar não cria; retomar não recria o que passou na pausa", async () => {
  const rule = await saveRecurrence(
    owner,
    null,
    base({ name: `Pausa ${run}`, frequency: "monthly", monthDay: 1, startDate: "2030-01-01" }),
  );
  await setRecurrencePaused(owner, rule.id, true);
  expect(await runRecurrence(rule.id, new Date("2030-01-01T12:00:00Z"))).toBeNull();
  await setRecurrencePaused(owner, rule.id, false);
  const [row] = await listRecurrences(owner).then((r) => r.filter((x) => x.id === rule.id));
  expect(row).toMatchObject({ pausedAt: null, summary: "Mensal, dia 1", nextOn: "2030-01-01" });
});

it("pessoal: só o dono vê e mexe, e gera tarefa pessoal do dono", async () => {
  const rule = await saveRecurrence(
    owner,
    null,
    base({
      name: `Minha ${run}`,
      visibility: "personal",
      payload: { title: `Pessoal ${run}`, projectIds: [] },
    }),
  );
  expect((await listRecurrences(other)).some((r) => r.id === rule.id)).toBe(false);
  await expect(setRecurrencePaused(other, rule.id, true)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(deleteRecurrence(other, rule.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    saveRecurrence(
      owner,
      null,
      base({
        visibility: "personal",
        payload: { title: "x", projectIds: [], assigneeId: other.userId },
      }),
    ),
  ).rejects.toMatchObject({ code: "VALIDATION" });

  await db.delete(taskRecurrenceRuns).where(eq(taskRecurrenceRuns.recurrenceId, rule.id));
  await db.delete(tasks).where(eq(tasks.recurrenceId, rule.id));
  await age(rule.id);
  const task = await runRecurrence(rule.id, new Date("2026-11-17T12:00:00Z"));
  expect(task).toMatchObject({
    visibility: "personal",
    creatorId: owner.userId,
    assigneeId: owner.userId,
  });
  expect(await getTaskByNumber(other, task!.number)).toBeNull();
  const { tasks: seen } = await listTasks(other, {}, { visibility: "all" });
  expect(seen.some((t) => t.id === task!.id)).toBe(false);
});

it("agente não escreve; equipe sem projeto é recusada", async () => {
  const agent: Actor = {
    kind: "agent",
    userId: owner.userId,
    apiKeyId: "x",
    permissions: [],
  } as never;
  await expect(saveRecurrence(agent, null, base())).rejects.toThrow();
  await expect(
    saveRecurrence(owner, null, base({ payload: { title: "x", projectIds: [] } })),
  ).rejects.toThrow();
});

it("excluir a regra não apaga as tarefas; o job segue se uma regra falhar", async () => {
  const rule = await saveRecurrence(owner, null, base({ name: `Excluir ${run}` }));
  await db.delete(taskRecurrenceRuns).where(eq(taskRecurrenceRuns.recurrenceId, rule.id));
  await age(rule.id);
  const task = await runRecurrence(rule.id, new Date("2026-11-18T12:00:00Z"));
  // regra quebrada: responsável que não existe
  const [broken] = await db
    .insert(taskRecurrences)
    .values({
      name: "Quebrada",
      ownerId: owner.userId,
      frequency: "weekdays",
      startDate: "2020-01-01",
      updatedAt: new Date("2020-01-01"),
      payload: { title: "x", projectIds: [projectId], assigneeId: "nao-existe" },
    })
    .returning();
  await dailyRecurrences(new Date("2026-11-19T12:00:00Z"));
  expect(await runsOf(broken.id)).toHaveLength(0);
  await db.delete(taskRecurrences).where(eq(taskRecurrences.id, broken.id));

  await deleteRecurrence(owner, rule.id);
  const [kept] = await db.select().from(tasks).where(eq(tasks.id, task!.id));
  expect(kept.recurrenceId).toBeNull();
});

it("A1: desativar a pessoa pausa as regras dela; só o admin retoma as da equipe", async () => {
  const leaving = await person("Saindo");
  const admin: Actor = { kind: "user", userId: other.userId, role: "admin" };
  const team = await saveRecurrence(
    leaving,
    null,
    base({ name: `Saida ${run}`, payload: { title: `S ${run}`, projectIds: [projectId] } }),
  );
  const mine = await saveRecurrence(
    leaving,
    null,
    base({
      name: `Saida p ${run}`,
      visibility: "personal",
      payload: { title: `P ${run}`, projectIds: [] },
    }),
  );
  await setMemberActive(admin, leaving.userId, false);
  const rows = await db
    .select({ id: taskRecurrences.id, pausedAt: taskRecurrences.pausedAt })
    .from(taskRecurrences)
    .where(eq(taskRecurrences.ownerId, leaving.userId));
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.pausedAt)).toBe(true);
  expect(mine.id).toBeTruthy();

  await expect(setRecurrencePaused(owner, team.id, false)).rejects.toThrow();
  await setRecurrencePaused(admin, team.id, false);
  const [after] = await db.select().from(taskRecurrences).where(eq(taskRecurrences.id, team.id));
  expect(after.pausedAt).toBeNull();
});
