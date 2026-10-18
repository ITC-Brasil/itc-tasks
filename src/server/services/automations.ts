import { and, asc, eq, inArray, isNull, min, ne, or, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  automationRules,
  automationRuns,
  cycles,
  labels,
  taskEvents,
  taskLabels,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import {
  type AutomationAction,
  type AutomationConditions,
  type AutomationRuleInput,
  type AutomationTrigger,
  type EvaluateJob,
  MAX_DEPTH,
  automationActionsSchema,
  automationConditionsSchema,
  automationRuleSchema,
  triggerOf,
} from "@/lib/validation/automations";
import { type Actor, assertAdmin } from "@/server/permissions";
import { addComment } from "./comments";
import { notifyFromAutomation } from "./notifications";
import { lockTask, record, updateTask } from "./tasks";

// ADR-052: regras "Quando → Se → Então". Só o worker avalia; a tela só cadastra.

export class AutomationError extends Error {}

type Rule = typeof automationRules.$inferSelect;
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

async function snapshot(taskId: string) {
  const [task] = await db
    .select({ task: tasks, category: workflowStatuses.category })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(eq(tasks.id, taskId));
  return task ?? null;
}

export function matches(c: AutomationConditions, s: NonNullable<Snapshot>) {
  if (c.statusCategory && c.statusCategory !== s.category) return false;
  if (c.priority && c.priority !== s.task.priority) return false;
  if (c.hasGlpi !== undefined && c.hasGlpi !== (s.task.glpiTicket != null)) return false;
  if (c.hasMobileUnit !== undefined && c.hasMobileUnit !== (s.task.mobileUnitId != null))
    return false;
  return true;
}

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function act(action: AutomationAction, rule: Rule, actor: Actor, taskId: string) {
  const s = await snapshot(taskId);
  if (!s) return;
  const { task } = s;
  switch (action.type) {
    case "notify": {
      const ids =
        action.to === "team"
          ? (
              await db
                .select({ id: user.id })
                .from(user)
                .where(or(isNull(user.banned), eq(user.banned, false)))
            ).map((u) => u.id)
          : [action.to === "creator" ? task.creatorId : task.assigneeId].filter(
              (id): id is string => !!id,
            );
      return notifyFromAutomation(taskId, ids, rule.name);
    }
    case "setStatus":
      if (task.statusId !== action.statusId)
        await updateTask(actor, taskId, { statusId: action.statusId });
      return;
    case "addLabel": {
      const current = (
        await db
          .select({ id: taskLabels.labelId })
          .from(taskLabels)
          .where(eq(taskLabels.taskId, taskId))
      ).map((l) => l.id);
      if (!current.includes(action.labelId))
        await updateTask(actor, taskId, { labelIds: [...current, action.labelId] });
      return;
    }
    case "comment": {
      const text = action.text
        .replaceAll("{ID}", `TI-${task.number}`)
        .replaceAll("{GLPI}", task.glpiTicket != null ? String(task.glpiTicket) : "—");
      await addComment(actor, taskId, doc(text));
      return;
    }
    case "moveToActiveCycle":
      // sem ciclo ativo não faz nada (ADR-052)
      return db.transaction(async (tx) => {
        const [cycle] = await tx.select().from(cycles).where(eq(cycles.state, "active"));
        const current = await lockTask(tx, taskId);
        if (!cycle || current.cycleId === cycle.id) return;
        await tx
          .update(tasks)
          .set({ cycleId: cycle.id, updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        await record(tx, actor, taskId, [
          {
            type: "field_changed",
            payload: { field: "cycle", from: current.cycleId, to: cycle.id },
          },
        ]);
      });
    case "moveToTop":
      return db.transaction(async (tx) => {
        const current = await lockTask(tx, taskId);
        const [first] = await tx
          .select({ p: min(tasks.position) })
          .from(tasks)
          .where(and(eq(tasks.statusId, current.statusId), ne(tasks.id, taskId)));
        if (!first?.p || current.position < first.p) return;
        await tx
          .update(tasks)
          .set({ position: generateKeyBetween(null, first.p), updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        await record(tx, actor, taskId, [
          { type: "field_changed", payload: { field: "position" } },
        ]);
      });
  }
}

/** Roda as regras ligadas de um gatilho para uma tarefa; cada execução vira um automation_run. */
export async function runRules(trigger: AutomationTrigger, taskId: string, depth: number) {
  const rules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.enabled, true), eq(automationRules.trigger, trigger)))
    .orderBy(asc(automationRules.createdAt));
  // condições sobre a tarefa como estava ao começar: uma regra não reage à outra no mesmo job
  const s = await snapshot(taskId);
  if (!s) return;
  for (const rule of rules) {
    const conditions = automationConditionsSchema.safeParse(rule.conditions);
    if (conditions.success && !matches(conditions.data, s)) continue;
    let error: string | null = null;
    if (!conditions.success) error = "Condições inválidas";
    else if (depth >= MAX_DEPTH) error = `Cadeia de automações passou de ${MAX_DEPTH}`;
    else {
      const actor: Actor = { kind: "automation", automationId: rule.id, depth: depth + 1 };
      try {
        for (const action of automationActionsSchema.parse(rule.actions))
          await act(action, rule, actor, taskId);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await db.transaction(async (tx) => {
      await tx.insert(automationRuns).values({ ruleId: rule.id, taskId, ok: !error, error });
      await tx
        .update(automationRules)
        .set({ runCount: sql`${automationRules.runCount} + 1`, lastRunAt: new Date() })
        .where(eq(automationRules.id, rule.id));
    });
  }
}

/** Job automation.evaluate: os eventos de uma escrita → gatilhos (sem repetir) → regras. */
export async function evaluate(job: EvaluateJob) {
  const events = await db.select().from(taskEvents).where(inArray(taskEvents.id, job.eventIds));
  if (!events.length) return;
  const triggers = new Set(events.map(triggerOf).filter((t) => t !== null));
  for (const trigger of triggers) await runRules(trigger, events[0].taskId, job.depth);
}

/** Job automation.overdue (00:05): abertas com prazo ontem disparam `task.overdue`. */
export async function overdue(now = new Date()) {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(
      and(
        ne(workflowStatuses.category, "done"),
        isNull(tasks.archivedAt),
        eq(tasks.dueDate, addDays(todayISO(now), -1)),
      ),
    );
  for (const r of rows) await runRules("task.overdue", r.id, 0);
  return rows.length;
}

// ── Tela (só admin) ─────────────────────────────────────────────────

export async function listRules(actor: Actor) {
  assertAdmin(actor);
  return db.select().from(automationRules).orderBy(asc(automationRules.createdAt));
}

/** Status e etiquetas das ações precisam existir e estar ativos. */
async function assertRefs(actions: AutomationAction[]) {
  for (const a of actions) {
    if (a.type === "setStatus") {
      const [s] = await db
        .select({ id: workflowStatuses.id })
        .from(workflowStatuses)
        .where(and(eq(workflowStatuses.id, a.statusId), isNull(workflowStatuses.archivedAt)));
      if (!s) throw new AutomationError("Status não encontrado ou arquivado");
    }
    if (a.type === "addLabel") {
      const [l] = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.id, a.labelId), isNull(labels.archivedAt)));
      if (!l) throw new AutomationError("Etiqueta não encontrada ou arquivada");
    }
  }
}

export async function saveRule(actor: Actor, id: string | null, input: AutomationRuleInput) {
  assertAdmin(actor);
  const data = automationRuleSchema.parse(input);
  await assertRefs(data.actions);
  if (!id) {
    const [row] = await db.insert(automationRules).values(data).returning();
    return row;
  }
  const [row] = await db
    .update(automationRules)
    .set(data)
    .where(eq(automationRules.id, id))
    .returning();
  if (!row) throw new AutomationError("Automação não encontrada");
  return row;
}

export async function setRuleEnabled(actor: Actor, id: string, enabled: boolean) {
  assertAdmin(actor);
  const [row] = await db
    .update(automationRules)
    .set({ enabled })
    .where(eq(automationRules.id, id))
    .returning({ id: automationRules.id });
  if (!row) throw new AutomationError("Automação não encontrada");
}
