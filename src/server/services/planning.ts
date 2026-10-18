import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cycles,
  milestones,
  mobileUnits,
  projects,
  taskMobileUnits,
  taskProjects,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import {
  type CycleInput,
  type MilestoneInput,
  closeCycleSchema,
  cycleSchema,
  dashboardQuerySchema,
  milestoneSchema,
} from "@/lib/validation/planning";
import type { Actor } from "@/server/actor";
import { TaskError, lockTask, record } from "./tasks";

// ADR-053: admin e member planejam; nada é excluído (ciclo encerra, marco conclui)

function assertPerson(actor: Actor) {
  if (actor.kind !== "user" && actor.kind !== "agent")
    throw new TaskError("VALIDATION", "Só pessoas e agentes planejam ciclos e marcos");
}

/** M-061: 23505 (unique_violation) de uma corrida vira TaskError; o Drizzle embrulha em `cause`. */
export async function onUnique<T>(fn: () => Promise<T>, message: string) {
  try {
    return await fn();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") throw new TaskError("VALIDATION", message);
    throw error;
  }
}

// ── Ciclos ──────────────────────────────────────────────────────────

/** Ciclos com progresso (tarefas não arquivadas), os mais novos primeiro. */
export async function listCycles(state?: "planned" | "active" | "closed") {
  return db
    .select({
      id: cycles.id,
      number: cycles.number,
      startsOn: cycles.startsOn,
      endsOn: cycles.endsOn,
      state: cycles.state,
      total: count(tasks.id),
      done: count(sql`CASE WHEN ${tasks.completedAt} IS NOT NULL THEN 1 END`),
    })
    .from(cycles)
    .leftJoin(tasks, and(eq(tasks.cycleId, cycles.id), isNull(tasks.archivedAt)))
    .where(state ? eq(cycles.state, state) : undefined)
    .groupBy(cycles.id)
    .orderBy(desc(cycles.number));
}
export type CycleRow = Awaited<ReturnType<typeof listCycles>>[number];

export async function getCycleByNumber(number: number) {
  const [c] = await db.select().from(cycles).where(eq(cycles.number, number));
  return c ?? null;
}

export async function activeCycle() {
  const [c] = await db.select().from(cycles).where(eq(cycles.state, "active"));
  return c ?? null;
}

export async function createCycle(actor: Actor, input: CycleInput) {
  assertPerson(actor);
  const data = cycleSchema.parse(input);
  // o unique de `number` segura a corrida entre dois cadastros simultâneos
  return onUnique(
    () =>
      db.transaction(async (tx) => {
        const [{ last }] = await tx.select({ last: max(cycles.number) }).from(cycles);
        const [row] = await tx
          .insert(cycles)
          .values({ ...data, number: (last ?? 0) + 1 })
          .returning();
        return row;
      }),
    "Outro ciclo foi criado ao mesmo tempo. Tente de novo.",
  );
}

async function openCycle(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string) {
  const [c] = await tx.select().from(cycles).where(eq(cycles.id, id)).for("update");
  if (!c) throw new TaskError("NOT_FOUND", "Ciclo não encontrado");
  if (c.state === "closed")
    throw new TaskError("ARCHIVED_REFERENCE", `Ciclo ${c.number} já foi encerrado`);
  return c;
}

export async function updateCycle(actor: Actor, id: string, input: CycleInput) {
  assertPerson(actor);
  const data = cycleSchema.parse(input);
  return db.transaction(async (tx) => {
    await openCycle(tx, id);
    const [row] = await tx.update(cycles).set(data).where(eq(cycles.id, id)).returning();
    return row;
  });
}

/** Só sem outro ativo; o índice `cycles_one_active_uq` é a defesa contra a corrida. */
export async function startCycle(actor: Actor, id: string) {
  assertPerson(actor);
  return onUnique(
    () =>
      db.transaction(async (tx) => {
        const c = await openCycle(tx, id);
        if (c.state === "active") return c;
        const [other] = await tx.select().from(cycles).where(eq(cycles.state, "active"));
        if (other)
          throw new TaskError(
            "VALIDATION",
            `Encerre o Ciclo ${other.number} antes de iniciar outro`,
          );
        const [row] = await tx
          .update(cycles)
          .set({ state: "active" })
          .where(eq(cycles.id, id))
          .returning();
        return row;
      }),
    "Já existe um ciclo ativo",
  );
}

/** Tarefas não concluídas e não arquivadas do ciclo (lista de revisão do encerramento). */
export async function pendingTasks(cycleId: string) {
  return db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.cycleId, cycleId), isNull(tasks.archivedAt), isNull(tasks.completedAt)))
    .orderBy(asc(tasks.number));
}

/** Carga por pessoa: tarefas abertas do ciclo por responsável (P1). */
export async function cycleLoad(cycleId: string) {
  return db
    .select({ name: sql<string>`coalesce(${user.name}, 'Sem responsável')`, open: count() })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assigneeId))
    .where(and(eq(tasks.cycleId, cycleId), isNull(tasks.archivedAt), isNull(tasks.completedAt)))
    .groupBy(user.name)
    .orderBy(desc(count()), asc(user.name));
}

/** O próximo ciclo = o planejado de menor número. */
async function nextPlanned(tx: Pick<typeof db, "select"> = db) {
  const [n] = await tx
    .select()
    .from(cycles)
    .where(eq(cycles.state, "planned"))
    .orderBy(asc(cycles.number))
    .limit(1);
  return n ?? null;
}

export const nextPlannedCycle = () => nextPlanned();

/**
 * Encerra o ciclo ativo: as pendências marcadas vão para o próximo planejado, as demais ficam sem
 * ciclo; cada tarefa grava `field_changed` (ADR-053). Tudo numa transação.
 */
export async function closeCycle(actor: Actor, id: string, input: { carryTaskIds: string[] }) {
  assertPerson(actor);
  const { carryTaskIds } = closeCycleSchema.parse(input);
  return db.transaction(async (tx) => {
    const c = await openCycle(tx, id);
    if (c.state !== "active") throw new TaskError("VALIDATION", "Só o ciclo ativo é encerrado");
    const next = await nextPlanned(tx);
    if (!next) throw new TaskError("VALIDATION", "Crie o próximo ciclo antes de encerrar");
    const pending = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.cycleId, id), isNull(tasks.archivedAt), isNull(tasks.completedAt)));
    for (const { id: taskId } of pending) {
      await lockTask(tx, taskId);
      const to = carryTaskIds.includes(taskId) ? next.id : null;
      await tx
        .update(tasks)
        .set({ cycleId: to, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      await record(tx, actor, taskId, [
        { type: "field_changed", payload: { field: "cycle", from: id, to } },
      ]);
    }
    await tx.update(cycles).set({ state: "closed", closedAt: new Date() }).where(eq(cycles.id, id));
    return {
      next: next.number,
      carried: pending.filter((p) => carryTaskIds.includes(p.id)).length,
    };
  });
}

// ── Marcos ──────────────────────────────────────────────────────────

/** Marcos com progresso pelas tarefas ligadas; abertos primeiro, por prazo. */
export async function listMilestones(projectId?: string) {
  return db
    .select({
      id: milestones.id,
      name: milestones.name,
      description: milestones.description,
      projectId: milestones.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      dueOn: milestones.dueOn,
      closedAt: milestones.closedAt,
      total: count(tasks.id),
      done: count(sql`CASE WHEN ${tasks.completedAt} IS NOT NULL THEN 1 END`),
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .leftJoin(tasks, and(eq(tasks.milestoneId, milestones.id), isNull(tasks.archivedAt)))
    .where(projectId ? eq(milestones.projectId, projectId) : undefined)
    .groupBy(milestones.id, projects.code, projects.name)
    .orderBy(
      sql`${milestones.closedAt} IS NOT NULL`,
      sql`${milestones.dueOn} ASC NULLS LAST`,
      asc(milestones.name),
    );
}
export type MilestoneRow = Awaited<ReturnType<typeof listMilestones>>[number];

export async function saveMilestone(actor: Actor, id: string | null, input: MilestoneInput) {
  assertPerson(actor);
  const data = milestoneSchema.parse(input);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, data.projectId));
    if (!p) throw new TaskError("NOT_FOUND", "Projeto/Cliente não encontrado");
    // M-061: arquivado só passa se já era o projeto do marco
    const [current] = id ? await tx.select().from(milestones).where(eq(milestones.id, id)) : [];
    if (p.archivedAt && current?.projectId !== p.id)
      throw new TaskError("ARCHIVED_REFERENCE", `Projeto/Cliente ${p.code} está arquivado`);
    if (!id) {
      const [row] = await tx.insert(milestones).values(data).returning();
      return row;
    }
    if (!current) throw new TaskError("NOT_FOUND", "Marco não encontrado");
    // trocar o projeto deixaria tarefas ligadas a um marco de outro Projeto/Cliente
    if (data.projectId !== current.projectId) {
      const [linked] = await tx.select({ n: count() }).from(tasks).where(eq(tasks.milestoneId, id));
      if (linked.n > 0)
        throw new TaskError("VALIDATION", "Marco com tarefas não muda de Projeto/Cliente");
    }
    const [row] = await tx.update(milestones).set(data).where(eq(milestones.id, id)).returning();
    return row;
  });
}

export async function setMilestoneClosed(actor: Actor, id: string, closed: boolean) {
  assertPerson(actor);
  const [row] = await db
    .update(milestones)
    .set({ closedAt: closed ? new Date() : null })
    .where(eq(milestones.id, id))
    .returning({ id: milestones.id });
  if (!row) throw new TaskError("NOT_FOUND", "Marco não encontrado");
}

/** Marcos abertos com prazo no mês (calendário, V4). */
export async function milestonesDue(from: string, to: string) {
  return db
    .select({
      id: milestones.id,
      name: milestones.name,
      dueOn: milestones.dueOn,
      projectId: milestones.projectId,
      code: projects.code,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(
      and(
        isNull(milestones.closedAt),
        isNotNull(milestones.dueOn),
        sql`${milestones.dueOn} BETWEEN ${from} AND ${to}`,
      ),
    );
}

// ── Painel por Projeto/Cliente (P3) ─────────────────────────────────

const WEEKS = 12;

export async function projectDashboard(input: { projectId: string; days?: unknown }) {
  const { projectId, days } = dashboardQuerySchema.parse(input);
  const today = todayISO();
  const inProject = inArray(
    tasks.id,
    db
      .select({ id: taskProjects.taskId })
      .from(taskProjects)
      .where(eq(taskProjects.projectId, projectId)),
  );
  const base = and(isNull(tasks.archivedAt), inProject);
  const open = and(base, isNull(tasks.completedAt));
  const since = sql`now() - make_interval(days => ${days})`;
  const doneInPeriod = and(base, sql`${tasks.completedAt} >= ${since}`);

  const [[totals], [period], weekly, byStatus, byUnit] = await Promise.all([
    db
      .select({
        open: count(),
        overdue: count(sql`CASE WHEN ${tasks.dueDate} < ${today} THEN 1 END`),
      })
      .from(tasks)
      .where(open),
    db
      .select({
        done: count(),
        avgDays: sql<
          number | null
        >`round((avg(extract(epoch from ${tasks.completedAt} - ${tasks.createdAt})) / 86400)::numeric, 1)::float`,
      })
      .from(tasks)
      .where(doneInPeriod),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${tasks.completedAt} AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD')`,
        done: count(),
      })
      .from(tasks)
      .where(
        and(
          base,
          // M-061: mesmo fuso do agrupamento, senão domingo à noite cai na semana errada
          sql`${tasks.completedAt} AT TIME ZONE 'America/Sao_Paulo' >= date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(weeks => ${WEEKS - 1})`,
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ name: workflowStatuses.name, category: workflowStatuses.category, n: count() })
      .from(tasks)
      .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
      .where(open)
      .groupBy(workflowStatuses.id)
      .orderBy(asc(workflowStatuses.position)),
    db
      .select({ code: mobileUnits.code, n: count() })
      .from(taskMobileUnits)
      .innerJoin(tasks, eq(tasks.id, taskMobileUnits.taskId))
      .innerJoin(mobileUnits, eq(mobileUnits.id, taskMobileUnits.mobileUnitId))
      .where(open)
      .groupBy(mobileUnits.code)
      .orderBy(desc(count()), asc(mobileUnits.code)),
  ]);

  // semanas sem conclusão aparecem com zero (segunda-feira de cada semana)
  const counts = new Map(weekly.map((w) => [w.week, w.done]));
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - 7 * (WEEKS - 1 - i));
    const week = d.toISOString().slice(0, 10);
    return { week, done: counts.get(week) ?? 0 };
  });

  return {
    days,
    open: totals.open,
    overdue: totals.overdue,
    done: period.done,
    avgDays: period.avgDays,
    weeks,
    byStatus,
    byUnit,
  };
}
export type Dashboard = Awaited<ReturnType<typeof projectDashboard>>;
