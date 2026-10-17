import { and, asc, eq, gt, inArray, isNull, max, min, ne, or, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  checklistItems,
  labels,
  mobileUnits,
  projects,
  taskEvents,
  taskLabels,
  taskLinks,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import {
  type CreateTaskInput,
  type UpdateTaskInput,
  bulkUpdateSchema,
  checklistItemSchema,
  checklistTextSchema,
  createTaskSchema,
  linkSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";

// Toda escrita de tarefa passa aqui com um Actor e grava task_events (ADR-003, ADR-042)
export type TaskErrorCode = "VALIDATION" | "NOT_FOUND" | "ARCHIVED_REFERENCE";
export class TaskError extends Error {
  constructor(
    public code: TaskErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof tasks.$inferSelect;
type EventType =
  | "created"
  | "status_changed"
  | "assigned"
  | "field_changed"
  | "labels_changed"
  | "checklist_changed"
  | "link_added"
  | "link_removed";

function actorColumns(actor: Actor) {
  switch (actor.kind) {
    case "user":
      return { actorKind: actor.kind, actorUserId: actor.userId };
    case "agent":
      return { actorKind: actor.kind, actorUserId: actor.userId, apiKeyId: actor.apiKeyId };
    case "automation":
      return { actorKind: actor.kind, automationRuleId: actor.automationId };
    case "system":
      return { actorKind: actor.kind };
  }
}

async function record(
  tx: Tx,
  actor: Actor,
  taskId: string,
  events: { type: EventType; payload?: Record<string, unknown> }[],
) {
  if (events.length === 0) return;
  await tx.insert(taskEvents).values(
    events.map((e) => ({
      taskId,
      ...actorColumns(actor),
      type: e.type,
      payload: e.payload ?? {},
    })),
  );
}

/** Texto puro do documento Tiptap, para a busca (ADR-042). */
export function docText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content
    .map(docText)
    .join((node as { type?: string }).type === "doc" ? "\n" : "")
    .trim();
}

// ── Referências: existem e estão ativas ─────────────────────────────

async function activeRow<T extends { archivedAt: Date | null }>(
  rows: Promise<T[]>,
  what: string,
): Promise<T> {
  const [row] = await rows;
  if (!row) throw new TaskError("NOT_FOUND", `${what} não encontrado`);
  if (row.archivedAt) throw new TaskError("ARCHIVED_REFERENCE", `${what} arquivado`);
  return row;
}

const assertProject = (tx: Tx, id: string) =>
  activeRow(tx.select().from(projects).where(eq(projects.id, id)), "Projeto/Cliente");

const assertUnit = (tx: Tx, id: string) =>
  activeRow(
    tx
      .select({ archivedAt: mobileUnits.archivedAt })
      .from(mobileUnits)
      .where(eq(mobileUnits.id, id)),
    "Unidade Móvel",
  );

const assertStatus = (tx: Tx, id: string) =>
  activeRow(tx.select().from(workflowStatuses).where(eq(workflowStatuses.id, id)), "Status");

async function assertLabels(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await tx.select().from(labels).where(inArray(labels.id, ids));
  if (rows.length !== new Set(ids).size)
    throw new TaskError("NOT_FOUND", "Etiqueta não encontrada");
  if (rows.some((l) => l.archivedAt))
    throw new TaskError("ARCHIVED_REFERENCE", "Etiqueta arquivada");
}

async function assertAssignee(tx: Tx, id: string) {
  const [row] = await tx.select({ banned: user.banned }).from(user).where(eq(user.id, id));
  if (!row) throw new TaskError("NOT_FOUND", "Responsável não encontrado");
  if (row.banned) throw new TaskError("ARCHIVED_REFERENCE", "Responsável desativado");
}

/** Primeiro status ativo da categoria, pela ordem do workflow. */
async function firstStatus(tx: Tx, category: "todo" | "done") {
  const [row] = await tx
    .select()
    .from(workflowStatuses)
    .where(and(eq(workflowStatuses.category, category), isNull(workflowStatuses.archivedAt)))
    .orderBy(asc(workflowStatuses.position))
    .limit(1);
  if (!row) throw new TaskError("NOT_FOUND", `Nenhum status ativo na categoria ${category}`);
  return row;
}

async function lastPosition(tx: Tx, statusId: string, exceptId?: string) {
  const [row] = await tx
    .select({ p: max(tasks.position) })
    .from(tasks)
    .where(and(eq(tasks.statusId, statusId), exceptId ? ne(tasks.id, exceptId) : undefined));
  return generateKeyBetween(row?.p ?? null, null);
}

async function creatorFor(tx: Tx, actor: Actor, defaultAssigneeId: string | null) {
  if (actor.kind === "user" || actor.kind === "agent") return actor.userId;
  if (defaultAssigneeId) return defaultAssigneeId;
  const [admin] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .orderBy(asc(user.createdAt))
    .limit(1);
  if (!admin) throw new TaskError("NOT_FOUND", "Nenhum admin para registrar como criador");
  return admin.id;
}

async function lockTask(tx: Tx, id: string) {
  const [row] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
  if (!row) throw new TaskError("NOT_FOUND", "Tarefa não encontrada");
  return row;
}

// ── Escrita ─────────────────────────────────────────────────────────

export async function createTask(actor: Actor, input: CreateTaskInput) {
  const data = createTaskSchema.parse(input);
  return db.transaction(async (tx) => {
    const project = await assertProject(tx, data.projectId);
    if (data.mobileUnitId) await assertUnit(tx, data.mobileUnitId);
    if (data.assigneeId) await assertAssignee(tx, data.assigneeId);
    await assertLabels(tx, data.labelIds);
    const status = data.statusId
      ? await assertStatus(tx, data.statusId)
      : await firstStatus(tx, "todo");

    const [task] = await tx
      .insert(tasks)
      .values({
        title: data.title,
        projectId: data.projectId,
        statusId: status.id,
        priority: data.priority,
        assigneeId: data.assigneeId,
        mobileUnitId: data.mobileUnitId,
        glpiTicket: data.glpiTicket,
        dueDate: data.dueDate,
        descriptionJson: data.descriptionJson,
        descriptionText: docText(data.descriptionJson),
        creatorId: await creatorFor(tx, actor, project.defaultAssigneeId),
        createdVia: actor.kind,
        position: await lastPosition(tx, status.id),
        completedAt: status.category === "done" ? new Date() : null,
      })
      .returning();

    if (data.labelIds.length)
      await tx
        .insert(taskLabels)
        .values(data.labelIds.map((labelId) => ({ taskId: task.id, labelId })));
    let pos: string | null = null;
    for (const text of data.checklist) {
      pos = generateKeyBetween(pos, null);
      await tx.insert(checklistItems).values({ taskId: task.id, text, position: pos });
    }
    await record(tx, actor, task.id, [{ type: "created" }]);
    return task;
  });
}

const FIELDS = ["title", "priority", "projectId", "mobileUnitId", "glpiTicket", "dueDate"] as const;

/** Aplica a mudança já validada dentro da transação; devolve a tarefa nova. */
async function applyUpdate(
  tx: Tx,
  actor: Actor,
  current: Task,
  data: ReturnType<typeof updateTaskSchema.parse>,
) {
  if ("projectId" in data && data.projectId !== current.projectId) {
    if (!data.projectId) throw new TaskError("VALIDATION", "Projeto/Cliente é obrigatório");
    await assertProject(tx, data.projectId);
  }
  if (data.mobileUnitId && data.mobileUnitId !== current.mobileUnitId)
    await assertUnit(tx, data.mobileUnitId);
  if (data.assigneeId && data.assigneeId !== current.assigneeId)
    await assertAssignee(tx, data.assigneeId);

  const set: Partial<typeof tasks.$inferInsert> = {};
  const events: Parameters<typeof record>[3] = [];

  for (const field of FIELDS) {
    if (!(field in data)) continue;
    /* eslint-disable security/detect-object-injection -- `field` vem da lista fixa FIELDS */
    const [from, to] = [current[field], data[field]];
    /* eslint-enable security/detect-object-injection */
    if (to === from) continue;
    Object.assign(set, { [field]: to });
    events.push({ type: "field_changed", payload: { field, from, to } });
  }
  if ("assigneeId" in data && data.assigneeId !== current.assigneeId) {
    set.assigneeId = data.assigneeId;
    events.push({ type: "assigned", payload: { from: current.assigneeId, to: data.assigneeId } });
  }
  if ("descriptionJson" in data) {
    set.descriptionJson = data.descriptionJson;
    set.descriptionText = docText(data.descriptionJson);
    if (set.descriptionText !== current.descriptionText)
      events.push({ type: "field_changed", payload: { field: "description" } });
  }
  if (data.statusId && data.statusId !== current.statusId) {
    const [status, from] = await Promise.all([
      assertStatus(tx, data.statusId),
      tx.select().from(workflowStatuses).where(eq(workflowStatuses.id, current.statusId)),
    ]);
    set.statusId = status.id;
    set.position = await lastPosition(tx, status.id, current.id);
    Object.assign(set, completion(from[0]?.category, status.category, current.completedAt));
    events.push({ type: "status_changed", payload: { from: current.statusId, to: status.id } });
  }
  if (data.labelIds) {
    const before = (
      await tx
        .select({ id: taskLabels.labelId })
        .from(taskLabels)
        .where(eq(taskLabels.taskId, current.id))
    ).map((r) => r.id);
    const after = [...new Set(data.labelIds)];
    const added = after.filter((id) => !before.includes(id));
    await assertLabels(tx, added);
    if (added.length || after.length !== before.length) {
      await tx.delete(taskLabels).where(eq(taskLabels.taskId, current.id));
      if (after.length)
        await tx
          .insert(taskLabels)
          .values(after.map((labelId) => ({ taskId: current.id, labelId })));
      events.push({ type: "labels_changed", payload: { from: before, to: after } });
    }
  }

  await record(tx, actor, current.id, events);
  if (Object.keys(set).length === 0 && events.length === 0) return current;
  const [row] = await tx
    .update(tasks)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(tasks.id, current.id))
    .returning();
  return row;
}

/** ADR-022: entrar em `done` grava completedAt; sair limpa. */
function completion(from: string | undefined, to: string, completedAt: Date | null) {
  if (to === "done" && from !== "done") return { completedAt: new Date() };
  if (to !== "done") return { completedAt: null };
  return { completedAt };
}

export async function updateTask(actor: Actor, taskId: string, input: UpdateTaskInput) {
  const data = updateTaskSchema.parse(input);
  return db.transaction(async (tx) => applyUpdate(tx, actor, await lockTask(tx, taskId), data));
}

/** Kanban: muda status e posição (depois de `afterTaskId`, ou no topo). */
export async function moveTask(
  actor: Actor,
  taskId: string,
  input: { statusId: string; afterTaskId: string | null },
) {
  const { statusId, afterTaskId } = moveTaskSchema.parse(input);
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId);
    let task = await applyUpdate(tx, actor, current, { statusId });
    const [prev] = afterTaskId
      ? await tx
          .select({ p: tasks.position })
          .from(tasks)
          .where(and(eq(tasks.id, afterTaskId), eq(tasks.statusId, statusId)))
      : [{ p: null }];
    if (!prev) throw new TaskError("NOT_FOUND", "Tarefa de referência não está nesse status");
    const [next] = await tx
      .select({ p: min(tasks.position) })
      .from(tasks)
      .where(
        and(
          eq(tasks.statusId, statusId),
          ne(tasks.id, taskId),
          prev.p ? gt(tasks.position, prev.p) : undefined,
        ),
      );
    const position = generateKeyBetween(prev.p, next?.p ?? null);
    [task] = await tx.update(tasks).set({ position }).where(eq(tasks.id, taskId)).returning();
    return task;
  });
}

/** Move para o primeiro status `done`; idempotente (API.md › complete_task). */
export async function completeTask(actor: Actor, taskId: string) {
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId);
    if (current.completedAt) return current;
    const done = await firstStatus(tx, "done");
    return applyUpdate(tx, actor, current, { statusId: done.id });
  });
}

/** Ações em massa da lista (Módulo 05): status, responsável, prioridade. Tudo ou nada. */
export async function bulkUpdateTasks(
  actor: Actor,
  input: { taskIds: string[]; patch: UpdateTaskInput },
) {
  const { taskIds, patch } = bulkUpdateSchema.parse(input);
  return db.transaction(async (tx) => {
    const out: Task[] = [];
    for (const id of taskIds) out.push(await applyUpdate(tx, actor, await lockTask(tx, id), patch));
    return out;
  });
}

// ── Subtarefas (checklist) ──────────────────────────────────────────

export async function addChecklistItem(actor: Actor, taskId: string, text: string) {
  const value = checklistTextSchema.parse(text);
  return db.transaction(async (tx) => {
    await lockTask(tx, taskId);
    const [last] = await tx
      .select({ p: max(checklistItems.position) })
      .from(checklistItems)
      .where(eq(checklistItems.taskId, taskId));
    const [item] = await tx
      .insert(checklistItems)
      .values({ taskId, text: value, position: generateKeyBetween(last?.p ?? null, null) })
      .returning();
    await record(tx, actor, taskId, [
      { type: "checklist_changed", payload: { action: "added", text: value } },
    ]);
    return item;
  });
}

export async function updateChecklistItem(
  actor: Actor,
  itemId: string,
  input: { text?: string; done?: boolean; assigneeId?: string | null },
) {
  const data = checklistItemSchema.parse(input);
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item) throw new TaskError("NOT_FOUND", "Subtarefa não encontrada");
    if (data.assigneeId && data.assigneeId !== item.assigneeId)
      await assertAssignee(tx, data.assigneeId);
    const [row] = await tx
      .update(checklistItems)
      .set(data)
      .where(eq(checklistItems.id, itemId))
      .returning();
    const action =
      "done" in data && data.done !== item.done ? (data.done ? "checked" : "unchecked") : "edited";
    await record(tx, actor, item.taskId, [
      { type: "checklist_changed", payload: { action, text: row.text } },
    ]);
    return row;
  });
}

export async function removeChecklistItem(actor: Actor, itemId: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx.delete(checklistItems).where(eq(checklistItems.id, itemId)).returning();
    if (!item) throw new TaskError("NOT_FOUND", "Subtarefa não encontrada");
    await record(tx, actor, item.taskId, [
      { type: "checklist_changed", payload: { action: "removed", text: item.text } },
    ]);
  });
}

// ── Vínculos ────────────────────────────────────────────────────────

async function linkRow(tx: Tx, taskId: string, input: { kind: string; target: unknown }) {
  const { kind, target } = linkSchema.parse(input);
  const [other] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.number, target));
  if (!other) throw new TaskError("NOT_FOUND", `TI-${target} não encontrada`);
  if (other.id === taskId)
    throw new TaskError("VALIDATION", "Uma tarefa não se vincula a ela mesma");
  // "bloqueada por" é o mesmo vínculo `blocks` visto do outro lado
  const row =
    kind === "blocked_by"
      ? { fromTaskId: other.id, toTaskId: taskId, kind: "blocks" as const }
      : { fromTaskId: taskId, toTaskId: other.id, kind: kind as "blocks" | "relates" };
  return { row, payload: { kind, target } };
}

export async function addLink(
  actor: Actor,
  taskId: string,
  input: { kind: string; target: unknown },
) {
  return db.transaction(async (tx) => {
    await lockTask(tx, taskId);
    const { row, payload } = await linkRow(tx, taskId, input);
    const inserted = await tx.insert(taskLinks).values(row).onConflictDoNothing().returning();
    if (inserted.length) await record(tx, actor, taskId, [{ type: "link_added", payload }]);
  });
}

export async function removeLink(
  actor: Actor,
  taskId: string,
  input: { kind: string; target: unknown },
) {
  return db.transaction(async (tx) => {
    const { row, payload } = await linkRow(tx, taskId, input);
    const removed = await tx
      .delete(taskLinks)
      .where(
        and(
          eq(taskLinks.fromTaskId, row.fromTaskId),
          eq(taskLinks.toTaskId, row.toTaskId),
          eq(taskLinks.kind, row.kind),
        ),
      )
      .returning();
    if (removed.length) await record(tx, actor, taskId, [{ type: "link_removed", payload }]);
  });
}

// ── Leitura ─────────────────────────────────────────────────────────

/** Detalhe da tarefa pelo número visível (ADR-021). */
export async function getTaskByNumber(_actor: Actor, number: number) {
  const [task] = await db.select().from(tasks).where(eq(tasks.number, number));
  if (!task) return null;
  const [labelRows, checklist, linkRows] = await Promise.all([
    db.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, task.id)),
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.taskId, task.id))
      .orderBy(asc(checklistItems.position)),
    db
      .select({
        fromTaskId: taskLinks.fromTaskId,
        kind: taskLinks.kind,
        number: tasks.number,
        title: tasks.title,
        completedAt: tasks.completedAt,
      })
      .from(taskLinks)
      .innerJoin(
        tasks,
        sql`${tasks.id} = CASE WHEN ${taskLinks.fromTaskId} = ${task.id} THEN ${taskLinks.toTaskId} ELSE ${taskLinks.fromTaskId} END`,
      )
      .where(or(eq(taskLinks.fromTaskId, task.id), eq(taskLinks.toTaskId, task.id)))
      .orderBy(asc(tasks.number)),
  ]);
  const links = linkRows.map(({ fromTaskId, kind, ...other }) => ({
    ...other,
    kind:
      kind === "relates"
        ? ("relates" as const)
        : fromTaskId === task.id
          ? ("blocks" as const)
          : ("blocked_by" as const),
  }));
  return { ...task, labelIds: labelRows.map((r) => r.id), checklist, links };
}

/** Pessoas ativas para os seletores de responsável. */
export async function listAssignees() {
  return db
    .select({ id: user.id, name: user.name, initials: user.initials })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(asc(user.name));
}
