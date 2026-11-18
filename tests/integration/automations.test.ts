import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { db } from "@/db";
import {
  automationRules,
  automationRuns,
  comments,
  notifications,
  taskEvents,
  tasks,
} from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import type { AutomationRuleInput, EvaluateJob } from "@/lib/validation/automations";
import { type Actor, ForbiddenError } from "@/server/actor";
import {
  evaluate,
  listRules,
  overdue,
  saveRule,
  setRuleEnabled,
} from "@/server/services/automations";
import {
  createLabel,
  createProject,
  createStatus,
  listStatuses,
  setLabelArchived,
} from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { addChecklistItem, createTask, updateTask } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();
type U = Actor & { kind: "user" };
let ana: U, bia: U;
let projectId: string;
const status = {} as Record<"backlog" | "todo" | "in_progress" | "waiting" | "done", string>;

const person = async (name: string, role: "admin" | "member"): Promise<U> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-a${run}@t.test`,
    password: "senha-de-teste-123",
    role,
  });
  return { kind: "user", userId: u.id, role };
};

const rule = (input: AutomationRuleInput) => saveRule(system, null, input);
const task = (extra: Record<string, unknown> = {}) =>
  createTask(ana, { title: `Auto ${run}`, projectIds: [projectId], ...extra });

/** Faz o papel do worker: processa os automation.evaluate ainda não vistos, em cadeia. */
const done = new Set<string>();
async function drain() {
  for (let i = 0; i < 10; i++) {
    const jobs = (
      await db.execute<{ id: string; data: EvaluateJob }>(
        sql`SELECT id, data FROM pgboss.job WHERE name = 'automation.evaluate' ORDER BY created_on`,
      )
    ).rows.filter((j) => !done.has(j.id));
    if (!jobs.length) return;
    for (const j of jobs) {
      done.add(j.id);
      await evaluate(j.data);
    }
  }
}

const runsOf = (ruleId: string) =>
  db.select().from(automationRuns).where(eq(automationRuns.ruleId, ruleId));

beforeAll(async () => {
  [ana, bia] = [await person("AnaA", "admin"), await person("BiaA", "member")];
  const code = `A${String(run).slice(-6)}`;
  projectId = (await createProject(system, { code, name: `Auto ${run}`, kind: "client" })).id;
  const existing = await listStatuses(system);
  for (const category of ["backlog", "todo", "in_progress", "waiting", "done"] as const)
    status[category] =
      existing.find((x) => x.category === category)?.id ??
      (await createStatus(system, { name: `${category} ${run}`, category })).id;
  await drain(); // jobs de outros arquivos não contam
});

// cada teste liga só as próprias regras
beforeEach(async () => {
  await db.update(automationRules).set({ enabled: false });
});

it("só escrita que é gatilho enfileira automation.evaluate, na mesma transação", async () => {
  const count = async () =>
    (
      await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'automation.evaluate'`,
      )
    ).rows[0].n;
  const before = await count();
  const t = await task();
  expect(await count()).toBe(before + 1);
  await addChecklistItem(ana, t.id, "item");
  expect(await count()).toBe(before + 1);
  // M-053: sem retry, para não repetir ações já feitas
  const [job] = (
    await db.execute<{ retry_limit: number }>(
      sql`SELECT retry_limit FROM pgboss.job WHERE name = 'automation.evaluate' ORDER BY created_on DESC LIMIT 1`,
    )
  ).rows;
  expect(job.retry_limit).toBe(0);
  await drain();
});

it("status concluído com GLPI comenta com {GLPI} e {ID}; sem GLPI a condição não bate", async () => {
  const r = await rule({
    name: "GLPI",
    trigger: "task.status_changed",
    conditions: { statusCategory: "done", hasGlpi: true },
    actions: [{ type: "comment", text: "Atualize o chamado #{GLPI} da {ID}" }],
  });
  const withGlpi = await task({ glpiTicket: 48213 });
  const without = await task();
  await updateTask(ana, withGlpi.id, { statusId: status.done });
  await updateTask(ana, without.id, { statusId: status.done });
  await drain();

  const [c] = await db.select().from(comments).where(eq(comments.taskId, withGlpi.id));
  expect(c.bodyText).toBe(`Atualize o chamado #48213 da TI-${withGlpi.number}`);
  expect(c.actorKind).toBe("automation");
  expect(await db.select().from(comments).where(eq(comments.taskId, without.id))).toHaveLength(0);
  const runs = await runsOf(r.id);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ ok: true, taskId: withGlpi.id });
  const [saved] = await db.select().from(automationRules).where(eq(automationRules.id, r.id));
  expect(saved.runCount).toBe(1);
  expect(saved.lastRunAt).not.toBeNull();
});

it("notificar o criador gera aviso `automation` com o nome da regra, sem N4", async () => {
  await rule({
    name: "Avisar quem criou",
    trigger: "task.status_changed",
    conditions: { statusCategory: "done" },
    actions: [{ type: "notify", to: "creator" }],
  });
  const t = await task();
  await updateTask(ana, t.id, { statusId: status.done }); // a própria Ana conclui
  await drain();
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.taskId, t.id), eq(notifications.event, "automation")));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ userId: ana.userId, data: { rule: "Avisar quem criou" } });
});

it("atribuir em Backlog move para A fazer com o ator automação; sem ciclo ativo não faz nada", async () => {
  const r = await rule({
    name: "Puxar",
    trigger: "task.assigned",
    conditions: { statusCategory: "backlog" },
    actions: [{ type: "setStatus", statusId: status.todo }, { type: "moveToActiveCycle" }],
  });
  const t = await task({ statusId: status.backlog });
  await updateTask(ana, t.id, { assigneeId: bia.userId });
  await drain();
  const [after] = await db.select().from(tasks).where(eq(tasks.id, t.id));
  expect(after.statusId).toBe(status.todo);
  const [e] = await db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.taskId, t.id), eq(taskEvents.type, "status_changed")));
  expect(e).toMatchObject({ actorKind: "automation", automationRuleId: r.id });
  expect((await runsOf(r.id))[0].ok).toBe(true);
});

it("urgente vai para o topo da coluna", async () => {
  await rule({
    name: "Topo",
    trigger: "task.priority_changed",
    conditions: { priority: "urgent" },
    actions: [{ type: "moveToTop" }],
  });
  await task({ statusId: status.in_progress });
  const t = await task({ statusId: status.in_progress });
  await updateTask(ana, t.id, { priority: "urgent" });
  await drain();
  const [top] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.statusId, status.in_progress))
    .orderBy(tasks.position)
    .limit(1);
  expect(top.id).toBe(t.id);
});

it("laço entre duas regras para na profundidade 3 e registra o erro", async () => {
  const toDoing = await rule({
    name: "Ping",
    trigger: "task.status_changed",
    conditions: { statusCategory: "todo" },
    actions: [{ type: "setStatus", statusId: status.in_progress }],
  });
  const toTodo = await rule({
    name: "Pong",
    trigger: "task.status_changed",
    conditions: { statusCategory: "in_progress" },
    actions: [{ type: "setStatus", statusId: status.todo }],
  });
  const t = await task({ statusId: status.backlog });
  await updateTask(ana, t.id, { statusId: status.todo });
  await drain();
  const runs = [...(await runsOf(toDoing.id)), ...(await runsOf(toTodo.id))];
  // profundidades 0, 1 e 2 executam; a 3 é barrada
  expect(runs.filter((r) => r.ok)).toHaveLength(3);
  expect(runs.filter((r) => !r.ok).map((r) => r.error)).toEqual([
    "Cadeia de automações passou de 3",
  ]);
});

it("prazo vencido ontem dispara task.overdue e notifica o responsável", async () => {
  await rule({
    name: "Vencida",
    trigger: "task.overdue",
    conditions: {},
    actions: [{ type: "notify", to: "assignee" }],
  });
  const t = await task({ assigneeId: bia.userId, dueDate: addDays(todayISO(), -1) });
  await overdue();
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.taskId, t.id), eq(notifications.event, "automation")));
  expect(rows.map((r) => r.userId)).toEqual([bia.userId]);
});

it("ação que falha registra erro e não derruba as outras regras", async () => {
  const label = await createLabel(system, { name: `rot-${run}`, colorToken: "label-blue" });
  const broken = await rule({
    name: "Etiqueta",
    trigger: "task.created",
    conditions: {},
    actions: [{ type: "addLabel", labelId: label.id }],
  });
  const ok = await rule({
    name: "Aviso",
    trigger: "task.created",
    conditions: {},
    actions: [{ type: "notify", to: "creator" }],
  });
  await setLabelArchived(system, label.id, true);
  await task();
  await drain();
  expect((await runsOf(broken.id))[0].ok).toBe(false);
  expect((await runsOf(ok.id))[0].ok).toBe(true);
  await expect(
    saveRule(system, broken.id, {
      name: "Etiqueta",
      trigger: "task.created",
      conditions: {},
      actions: [{ type: "addLabel", labelId: label.id }],
    }),
  ).rejects.toThrow("Etiqueta não encontrada ou arquivada");
});

it("só admin lista e altera regras", async () => {
  await expect(listRules(bia)).rejects.toBeInstanceOf(ForbiddenError);
  const r = await rule({
    name: "X",
    trigger: "task.created",
    conditions: {},
    actions: [{ type: "moveToTop" }],
  });
  await expect(setRuleEnabled(bia, r.id, false)).rejects.toBeInstanceOf(ForbiddenError);
  await setRuleEnabled(ana, r.id, false);
  expect((await listRules(ana)).find((x) => x.id === r.id)?.enabled).toBe(false);
});

it("ADR-080: mover para Aguardando grava motivo e previsão a partir do dia em que roda", async () => {
  const toWaiting = { type: "setStatus" as const, statusId: status.waiting };
  await expect(
    rule({ name: "Sem campos", trigger: "task.created", conditions: {}, actions: [toWaiting] }),
  ).rejects.toThrow("Para Aguardando, informe o motivo e a data prevista");
  await expect(
    rule({
      name: "Outro sem texto",
      trigger: "task.created",
      conditions: {},
      actions: [{ ...toWaiting, waiting: { reason: "other", inDays: 3 } }],
    }),
  ).rejects.toThrow();
  const r = await rule({
    name: "Aguardar compra",
    trigger: "task.created",
    conditions: {},
    actions: [{ ...toWaiting, waiting: { reason: "purchase", note: "some", inDays: 5 } }],
  });
  const t = await task();
  await drain();
  const [after] = await db.select().from(tasks).where(eq(tasks.id, t.id));
  expect(after).toMatchObject({
    statusId: status.waiting,
    waitingReason: "purchase",
    waitingNote: null,
    waitingUntil: addDays(todayISO(), 5),
  });
  expect((await runsOf(r.id))[0].ok).toBe(true);

  // regra antiga, gravada sem os campos, falha com registro
  await setRuleEnabled(ana, r.id, false);
  const [old] = await db
    .insert(automationRules)
    .values({ name: "Antiga", trigger: "task.created", conditions: {}, actions: [toWaiting] })
    .returning();
  await task();
  await drain();
  expect((await runsOf(old.id))[0]).toMatchObject({ ok: false });

  // destino de outra categoria descarta os campos
  const other = await rule({
    name: "Fazer",
    trigger: "task.created",
    conditions: {},
    actions: [
      { type: "setStatus", statusId: status.todo, waiting: { reason: "client", inDays: 1 } },
    ],
  });
  expect(other.actions).toEqual([{ type: "setStatus", statusId: status.todo }]);
  await setRuleEnabled(ana, other.id, false);
});
