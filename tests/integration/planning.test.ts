import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { cycles, taskEvents, tasks } from "@/db/schema";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  closeCycle,
  createCycle,
  listMilestones,
  projectDashboard,
  saveMilestone,
  setMilestoneClosed,
  startCycle,
} from "@/server/services/planning";
import { bulkUpdateTasks, completeTask, createTask, updateTask } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let ana: Actor & { kind: "user" };
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Plan",
    email: `plan-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  ana = { kind: "user", userId: u.id, role: "member" };
  projectId = (
    await createProject(system, { code: `P${run}`, name: `Plan ${run}`, kind: "client" })
  ).id;
  otherProjectId = (
    await createProject(system, { code: `Q${run}`, name: `Outro ${run}`, kind: "client" })
  ).id;
  // banco de teste compartilhado entre execuções: um ativo por vez (cycles_one_active_uq)
  await db.update(cycles).set({ state: "closed" }).where(eq(cycles.state, "active"));
  await db.update(cycles).set({ state: "closed" }).where(eq(cycles.state, "planned"));
});

it("ciclo: um ativo por vez; encerrar leva as marcadas e solta as demais (ADR-053)", async () => {
  await expect(createCycle(ana, { startsOn: "2026-11-10", endsOn: "2026-11-01" })).rejects.toThrow(
    "O fim não pode ser antes do início",
  );
  const a = await createCycle(ana, { startsOn: "2026-10-19", endsOn: "2026-10-30" });
  const b = await createCycle(ana, { startsOn: "2026-11-02", endsOn: "2026-11-13" });
  expect(b.number).toBe(a.number + 1);
  await startCycle(ana, a.id);
  await expect(startCycle(ana, b.id)).rejects.toThrow(`Encerre o Ciclo ${a.number}`);

  const [carry, drop, done] = await Promise.all(
    ["Levar", "Soltar", "Feita"].map((title) =>
      createTask(ana, { title, projectIds: [projectId], cycleId: a.id }),
    ),
  );
  await completeTask(ana, done.id);
  await bulkUpdateTasks(ana, { taskIds: [drop.id], patch: { cycleId: a.id } }); // sem mudança

  const result = await closeCycle(ana, a.id, { carryTaskIds: [carry.id] });
  expect(result).toEqual({ next: b.number, carried: 1 });
  const cycleOf = async (id: string) =>
    (await db.select({ c: tasks.cycleId }).from(tasks).where(eq(tasks.id, id)))[0].c;
  expect(await cycleOf(carry.id)).toBe(b.id);
  expect(await cycleOf(drop.id)).toBeNull();
  expect(await cycleOf(done.id)).toBe(a.id);
  expect((await listActivity(carry.id)).at(-1)?.text).toBe(`moveu para o Ciclo ${b.number}`);
  expect((await listActivity(drop.id)).at(-1)?.text).toBe("tirou do ciclo");

  await expect(updateTask(ana, carry.id, { cycleId: a.id })).rejects.toThrow("já foi encerrado");
  await startCycle(ana, b.id);
  // sem ciclo planejado não encerra
  await expect(closeCycle(ana, b.id, { carryTaskIds: [] })).rejects.toThrow(
    "Crie o próximo ciclo antes de encerrar",
  );
  await db.update(cycles).set({ state: "closed" }).where(eq(cycles.id, b.id));
});

it("marco: do projeto da tarefa, aberto, com progresso", async () => {
  const m = await saveMilestone(ana, null, {
    name: `Entrega ${run}`,
    projectId,
    dueOn: "2026-11-30",
  });
  await expect(
    createTask(ana, { title: "Outro", projectIds: [otherProjectId], milestoneId: m.id }),
  ).rejects.toThrow("O marco é de outro Projeto/Cliente");
  const t1 = await createTask(ana, { title: "M1", projectIds: [projectId], milestoneId: m.id });
  const t2 = await createTask(ana, { title: "M2", projectIds: [projectId] });
  await updateTask(ana, t2.id, { milestoneId: m.id });
  await completeTask(ana, t1.id);
  expect((await listMilestones(projectId)).find((x) => x.id === m.id)).toMatchObject({
    total: 2,
    done: 1,
  });
  await expect(updateTask(ana, t2.id, { projectIds: [otherProjectId] })).rejects.toThrow(
    "Tire o marco",
  );
  await expect(saveMilestone(ana, m.id, { name: "x", projectId: otherProjectId })).rejects.toThrow(
    "não muda de Projeto/Cliente",
  );
  await setMilestoneClosed(ana, m.id, true);
  await expect(
    createTask(ana, { title: "M3", projectIds: [projectId], milestoneId: m.id }),
  ).rejects.toThrow("já foi concluído");
  const events = await db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.taskId, t2.id), eq(taskEvents.type, "field_changed")));
  expect(events.map((e) => (e.payload as { field: string }).field)).toContain("milestone");
});

it("painel: abertas, vencidas, concluídas no período e por semana", async () => {
  const [p] = await Promise.all([
    createProject(system, { code: `D${run}`, name: `Painel ${run}`, kind: "client" }),
  ]);
  await createTask(ana, { title: "Vencida", projectIds: [p.id], dueDate: "2020-01-01" });
  await createTask(ana, { title: "Aberta", projectIds: [p.id] });
  const feita = await createTask(ana, { title: "Feita", projectIds: [p.id] });
  await completeTask(ana, feita.id);
  const d = await projectDashboard({ projectId: p.id, days: "7" });
  expect(d).toMatchObject({ days: 7, open: 2, overdue: 1, done: 1 });
  expect(d.weeks).toHaveLength(12);
  expect(d.weeks.at(-1)?.done).toBe(1);
  expect(d.byStatus.reduce((n, s) => n + s.n, 0)).toBe(2);
  expect(typeof d.avgDays).toBe("number");
});
