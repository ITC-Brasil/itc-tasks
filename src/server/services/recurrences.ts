import { type SQL, and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { taskRecurrenceRuns, taskRecurrences, user } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { describeRule, latestOccurrence, nextOccurrence } from "@/lib/recurrence";
import { type RecurrenceInput, recurrenceSchema } from "@/lib/validation/recurrences";
import { PERSONAL_OWNER, createTaskSchema, recurrencePayloadSchema } from "@/lib/validation/tasks";
import { type Actor, ForbiddenError } from "@/server/permissions";
import { TaskError, assertTaskRefs, insertTask } from "./tasks";

// ADR-077: regras de recorrência. Regra pessoal só o dono vê e mexe (mesma regra do ADR-069).

type Rule = typeof taskRecurrences.$inferSelect;

function visibleRules(actor: Actor): SQL {
  return actor.kind === "user" || actor.kind === "agent"
    ? sql`(${taskRecurrences.visibility} = 'team' OR ${taskRecurrences.ownerId} = ${actor.userId})`
    : sql`${taskRecurrences.visibility} = 'team'`;
}

/** Só pessoas escrevem; o agente só lista (sem ferramenta de escrita no MCP). */
function personOf(actor: Actor) {
  if (actor.kind !== "user") throw new ForbiddenError();
  return actor.userId;
}

export async function listRecurrences(actor: Actor, today = todayISO()) {
  const rows = await db
    .select({
      rule: taskRecurrences,
      ownerName: user.name,
      lastRunOn: max(taskRecurrenceRuns.runOn),
    })
    .from(taskRecurrences)
    .innerJoin(user, eq(user.id, taskRecurrences.ownerId))
    .leftJoin(taskRecurrenceRuns, eq(taskRecurrenceRuns.recurrenceId, taskRecurrences.id))
    .where(visibleRules(actor))
    .groupBy(taskRecurrences.id, user.name)
    .orderBy(asc(taskRecurrences.pausedAt), asc(taskRecurrences.name));
  return rows.map(({ rule, ownerName, lastRunOn }) => ({
    ...rule,
    ownerName,
    lastRunOn,
    summary: describeRule(rule),
    // a de hoje já criada não é a "próxima"
    nextOn: rule.pausedAt
      ? null
      : nextOccurrence(rule, lastRunOn && lastRunOn >= today ? addDays(today, 1) : today),
    payload: recurrencePayloadSchema.parse(rule.payload),
  }));
}
export type RecurrenceRow = Awaited<ReturnType<typeof listRecurrences>>[number];

async function findRule(actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(taskRecurrences)
    .where(and(eq(taskRecurrences.id, id), visibleRules(actor)));
  if (!row) throw new TaskError("NOT_FOUND", "Recorrência não encontrada");
  return row;
}

/** Cria (id null) ou edita. A visibilidade não muda depois de criada. Cria a de hoje, se houver. */
export async function saveRecurrence(actor: Actor, id: string | null, input: RecurrenceInput) {
  const ownerId = personOf(actor);
  const current = id ? await findRule(actor, id) : null;
  const data = recurrenceSchema.parse({
    ...input,
    visibility: current?.visibility ?? input.visibility,
  });
  if (
    data.visibility === "personal" &&
    data.payload.assigneeId &&
    data.payload.assigneeId !== (current?.ownerId ?? ownerId)
  )
    throw new TaskError("VALIDATION", PERSONAL_OWNER);
  const rule = await db.transaction(async (tx) => {
    await assertTaskRefs(tx, data.payload);
    const values = {
      name: data.name,
      frequency: data.frequency,
      weekdays: data.weekdays,
      monthDay: data.monthDay,
      intervalMonths: data.intervalMonths,
      startDate: data.startDate,
      dueInDays: data.dueInDays,
      dueTime: data.dueTime,
      payload: data.payload,
    };
    const [row] = current
      ? await tx
          .update(taskRecurrences)
          .set(values)
          .where(eq(taskRecurrences.id, current.id))
          .returning()
      : await tx
          .insert(taskRecurrences)
          .values({ ...values, visibility: data.visibility, ownerId })
          .returning();
    return row;
  });
  if (!rule.pausedAt) await runRecurrence(rule.id);
  return rule;
}

export async function setRecurrencePaused(actor: Actor, id: string, paused: boolean) {
  personOf(actor);
  const rule = await findRule(actor, id);
  await db
    .update(taskRecurrences)
    .set({ pausedAt: paused ? new Date() : null })
    .where(eq(taskRecurrences.id, rule.id));
  // retomar não recria as perdidas na pausa: o piso passa a ser hoje (updated_at)
  if (!paused) await runRecurrence(rule.id);
}

/** Excluir não apaga as tarefas criadas: elas só perdem o selo (FK `SET NULL`). */
export async function deleteRecurrence(actor: Actor, id: string) {
  personOf(actor);
  const rule = await findRule(actor, id);
  await db.delete(taskRecurrences).where(eq(taskRecurrences.id, rule.id));
}

/**
 * Cria a ocorrência mais recente pendente da regra (ADR-077). Idempotente: a linha de
 * `task_recurrence_runs` (chave regra + data) entra antes da tarefa, na mesma transação.
 * O piso é o dia da última edição: regra editada ou retomada não recria o passado.
 */
export async function runRecurrence(id: string, now = new Date()) {
  const today = todayISO(now);
  return db.transaction(async (tx) => {
    const [rule] = await tx
      .select()
      .from(taskRecurrences)
      .where(and(eq(taskRecurrences.id, id), isNull(taskRecurrences.pausedAt)))
      .for("update");
    if (!rule) return null;
    const [last] = await tx
      .select({ runOn: taskRecurrenceRuns.runOn })
      .from(taskRecurrenceRuns)
      .where(eq(taskRecurrenceRuns.recurrenceId, rule.id))
      .orderBy(desc(taskRecurrenceRuns.runOn))
      .limit(1);
    const floor = [todayISO(rule.updatedAt), last ? addDays(last.runOn, 1) : ""].sort().at(-1)!;
    const runOn = latestOccurrence(rule, today, floor);
    if (!runOn) return null;
    const [claimed] = await tx
      .insert(taskRecurrenceRuns)
      .values({ recurrenceId: rule.id, runOn })
      .onConflictDoNothing()
      .returning();
    if (!claimed) return null;
    const payload = recurrencePayloadSchema.parse(rule.payload);
    const data = createTaskSchema.parse({
      ...payload,
      visibility: rule.visibility,
      dueDate: addDays(runOn, rule.dueInDays),
      dueTime: rule.dueTime,
    });
    const task = await insertTask(
      tx,
      { kind: "automation", automationId: rule.id, depth: 0 },
      data,
      { creatorId: rule.ownerId, recurrence: { id: rule.id, name: rule.name } },
    );
    await tx
      .update(taskRecurrenceRuns)
      .set({ taskId: task.id })
      .where(
        and(eq(taskRecurrenceRuns.recurrenceId, rule.id), eq(taskRecurrenceRuns.runOn, runOn)),
      );
    return task;
  });
}

/** Job `recurrence.daily` (06:00): uma regra com erro não impede as outras. */
export async function dailyRecurrences(now = new Date()) {
  const rules = await db
    .select({ id: taskRecurrences.id, name: taskRecurrences.name })
    .from(taskRecurrences)
    .where(isNull(taskRecurrences.pausedAt));
  let created = 0;
  for (const r of rules) {
    try {
      if (await runRecurrence(r.id, now)) created++;
    } catch (err) {
      console.error("recorrência: falhou", r.id, err instanceof Error ? err.message : err);
    }
  }
  return created;
}

export type { Rule as RecurrenceRule };
