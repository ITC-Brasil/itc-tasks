import {
  type SQL,
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  max,
  min,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  attachments,
  checklistItems,
  comments,
  cycles,
  involvedPeople,
  labels,
  milestones,
  mobileUnits,
  projects,
  taskDeletions,
  taskEvents,
  templates,
  taskInvolved,
  taskLabels,
  taskMobileUnits,
  taskProjects,
  taskLinks,
  taskRecurrences,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import {
  type CreateTaskInput,
  type TaskFilters,
  type UpdateTaskInput,
  bulkUpdateSchema,
  deleteTasksSchema,
  DUE_TIME_NEEDS_DATE,
  checklistItemSchema,
  checklistTextSchema,
  PERSONAL_NO_PLANNING,
  PERSONAL_OWNER,
  TASK_NEEDS_PROJECT,
  TEAM_NEEDS_PROJECT,
  createTaskSchema,
  linkSchema,
  moveTaskSchema,
  taskTemplatePayloadSchema,
  taskFiltersSchema,
  updateTaskSchema,
  WAITING_NEEDED,
  WAITING_NOTE_NEEDED,
  WAITING_ONLY,
  WAITING_PAST,
} from "@/lib/validation/tasks";
import { addDays, nowHM, todayISO } from "@/lib/dates";
import { type Actor, ForbiddenError, canDeleteTask } from "@/server/permissions";
import { type EvaluateJob, triggerOf } from "@/lib/validation/automations";
import { type FanoutJob, QUEUES, enqueue } from "@/server/jobs";
import { removeStoredFiles } from "@/server/services/attachments";

// Toda escrita de tarefa passa aqui com um Actor e grava task_events (ADR-003, ADR-042)
export type TaskErrorCode =
  "VALIDATION" | "NOT_FOUND" | "ARCHIVED_REFERENCE" | "TOO_LARGE" | "UNSUPPORTED_TYPE";
export class TaskError extends Error {
  constructor(
    public code: TaskErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type StatusCategory = (typeof workflowStatuses.$inferSelect)["category"];
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof tasks.$inferSelect;
type EventType =
  | "created"
  | "status_changed"
  | "assigned"
  | "field_changed"
  | "labels_changed"
  | "involved_changed"
  | "checklist_changed"
  | "link_added"
  | "link_removed"
  | "dependency_added" // ADR-079
  | "dependency_removed"
  | "unblocked"
  | "projects_changed"
  | "mobile_units_changed"
  | "commented"
  | "comment_edited"
  | "attachment_added"
  | "imported";

/**
 * ADR-069: a única regra de leitura de tarefa. Pessoa e agente veem as da equipe e as pessoais
 * que a própria pessoa criou; automação e sistema, só as da equipe. Toda consulta de tarefa usa
 * esta condição (ou `lockTask`/`assertVisible`, que a aplicam).
 */
export function visibleTo(actor: Actor): SQL {
  return actor.kind === "user" || actor.kind === "agent"
    ? sql`(${tasks.visibility} = 'team' OR ${tasks.creatorId} = ${actor.userId})`
    : sql`${tasks.visibility} = 'team'`;
}
/** Visões e números da equipe: a tarefa pessoal fica de fora até para o dono. */
export const teamOnly = eq(tasks.visibility, "team");

/** Leitura por id (comentários, histórico, anexos): some para quem não vê, sem dizer que existe. */
export async function assertVisible(actor: Actor, taskId: string, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), visibleTo(actor)));
  if (!row) throw new TaskError("NOT_FOUND", "Tarefa não encontrada");
}

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

export async function record(
  tx: Tx,
  actor: Actor,
  taskId: string,
  events: { type: EventType; payload?: Record<string, unknown> }[],
  // ADR-056: importação não avisa ninguém nem dispara automações; o SSE continua
  { silent = false }: { silent?: boolean } = {},
) {
  if (events.length === 0) return [];
  const [task] = await tx
    .select({ visibility: tasks.visibility })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  const personal = task?.visibility === "personal";
  const inserted = await tx
    .insert(taskEvents)
    .values(
      events.map((e) => ({
        taskId,
        ...actorColumns(actor),
        type: e.type,
        payload: e.payload ?? {},
      })),
    )
    .returning({ id: taskEvents.id });
  // ADR-050: o fanout entra na fila na mesma transação
  const eventIds = inserted.map((r) => r.id);
  if (!silent) await enqueue(tx, QUEUES.fanout, { eventIds } satisfies FanoutJob);
  // ADR-052: só escritas que são gatilho; a profundidade cresce a cada automação na cadeia
  // ADR-069: tarefa pessoal não dispara automação da equipe
  if (!silent && !personal && events.some((e) => triggerOf(e)))
    await enqueue(tx, QUEUES.evaluate, {
      eventIds,
      depth: actor.kind === "automation" ? actor.depth : 0,
    } satisfies EvaluateJob);
  // ADR-048: o Postgres só entrega o NOTIFY no commit; /api/events repassa às abas
  // `by` só para pessoa: a aba ignora as próprias escritas, mas não as do agente dela (M-039)
  const fields = JSON.stringify([...new Set(events.map((e) => e.type))]);
  await tx.execute(
    sql`SELECT pg_notify('task_changed', json_build_object('id', id, 'number', number, 'fields', ${fields}::json, 'by', ${actor.kind === "user" ? actor.userId : null}::text, 'owner', CASE WHEN visibility = 'personal' THEN creator_id END)::text) FROM tasks WHERE id = ${taskId}`,
  );
  return eventIds;
}

/** JSON com chaves ordenadas: o jsonb do Postgres não preserva a ordem enviada. */
export function stable(value: unknown): string {
  return JSON.stringify(value ?? null, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** IDs dos nós `mention` do documento Tiptap. */
export function mentionIds(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as { type?: unknown; attrs?: { id?: unknown }; content?: unknown };
  const own = n.type === "mention" && typeof n.attrs?.id === "string" ? [n.attrs.id] : [];
  const children = Array.isArray(n.content) ? n.content.flatMap(mentionIds) : [];
  return [...new Set([...own, ...children])];
}

/** Texto puro do documento Tiptap, para a busca (ADR-042). */
export function docText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown };
  if (typeof n.text === "string") return n.text;
  const label = (n.attrs as { label?: unknown } | undefined)?.label;
  if (n.type === "mention" && typeof label === "string") return `@${label}`;
  if (!Array.isArray(n.content)) return "";
  return n.content
    .map(docText)
    .join((node as { type?: string }).type === "doc" ? "\n" : "")
    .trim();
}

/** ADR-061: o label da menção vem do banco, não do cliente. */
export async function relabelMentions<T>(tx: Tx | typeof db, doc: T): Promise<T> {
  const ids = mentionIds(doc);
  if (!ids.length) return doc;
  const rows = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, ids));
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const n = node as { type?: unknown; attrs?: { id?: unknown }; content?: unknown };
    const out: Record<string, unknown> = { ...n };
    if (n.type === "mention" && typeof n.attrs?.id === "string")
      out.attrs = { ...n.attrs, label: names.get(n.attrs.id) ?? "pessoa desconhecida" };
    if (Array.isArray(n.content)) out.content = n.content.map(walk);
    return out;
  };
  return walk(doc) as T;
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

/** Só os acrescentados precisam estar ativos: o que já estava pode ter sido arquivado depois. */
async function assertActive(
  tx: Tx,
  table: typeof projects | typeof mobileUnits,
  ids: string[],
  what: string,
) {
  if (ids.length === 0) return;
  const rows = await tx
    .select({ archivedAt: table.archivedAt })
    .from(table)
    .where(inArray(table.id, ids));
  if (rows.length !== ids.length) throw new TaskError("NOT_FOUND", `${what} não encontrado`);
  if (rows.some((r) => r.archivedAt))
    throw new TaskError("ARCHIVED_REFERENCE", `${what} arquivado`);
}

/** ADR-045: cada UM com cliente pertence a um dos projetos da tarefa. */
async function assertUnitsFit(tx: Tx, unitIds: string[], projectIds: string[], removed: string[]) {
  if (unitIds.length === 0) return;
  const rows = await tx
    .select({
      code: mobileUnits.code,
      projectId: mobileUnits.projectId,
      projectCode: projects.code,
    })
    .from(mobileUnits)
    .leftJoin(projects, eq(projects.id, mobileUnits.projectId))
    .where(inArray(mobileUnits.id, unitIds));
  for (const u of rows) {
    if (!u.projectId || projectIds.includes(u.projectId)) continue;
    throw new TaskError(
      "VALIDATION",
      removed.includes(u.projectId)
        ? `Remova antes a UM ${u.code}: ela é do Projeto/Cliente ${u.projectCode}`
        : `A Unidade Móvel ${u.code} pertence a outro Projeto/Cliente`,
    );
  }
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

async function linkedIds(tx: Tx, taskId: string) {
  const [p, u] = await Promise.all([
    tx
      .select({ id: taskProjects.projectId })
      .from(taskProjects)
      .where(eq(taskProjects.taskId, taskId)),
    tx
      .select({ id: taskMobileUnits.mobileUnitId })
      .from(taskMobileUnits)
      .where(eq(taskMobileUnits.taskId, taskId)),
  ]);
  return { projectIds: p.map((r) => r.id), unitIds: u.map((r) => r.id) };
}

async function writeLinks(
  tx: Tx,
  taskId: string,
  projectIds: string[] | null,
  unitIds: string[] | null,
) {
  if (projectIds) {
    await tx.delete(taskProjects).where(eq(taskProjects.taskId, taskId));
    // tarefa pessoal pode ficar sem Projeto/Cliente (ADR-069)
    if (projectIds.length)
      await tx.insert(taskProjects).values(projectIds.map((projectId) => ({ taskId, projectId })));
  }
  if (unitIds) {
    await tx.delete(taskMobileUnits).where(eq(taskMobileUnits.taskId, taskId));
    if (unitIds.length)
      await tx
        .insert(taskMobileUnits)
        .values(unitIds.map((mobileUnitId) => ({ taskId, mobileUnitId })));
  }
}

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

/** ADR-073: envolvido existente; arquivado só se já estava na tarefa (quem chama passa os novos). */
async function assertInvolved(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await tx.select().from(involvedPeople).where(inArray(involvedPeople.id, ids));
  if (rows.length !== new Set(ids).size)
    throw new TaskError("NOT_FOUND", "Envolvido não encontrado");
  if (rows.some((p) => p.archivedAt))
    throw new TaskError("ARCHIVED_REFERENCE", "Envolvido arquivado");
}

/** ADR-053: ciclo existente e não encerrado. */
async function assertCycle(tx: Tx, id: string) {
  const [c] = await tx.select().from(cycles).where(eq(cycles.id, id));
  if (!c) throw new TaskError("NOT_FOUND", "Ciclo não encontrado");
  if (c.state === "closed")
    throw new TaskError("ARCHIVED_REFERENCE", `Ciclo ${c.number} já foi encerrado`);
}

/** ADR-053: marco aberto, de um dos Projetos/Clientes da tarefa. */
async function assertMilestone(tx: Tx, id: string, projectIds: string[]) {
  const [m] = await tx.select().from(milestones).where(eq(milestones.id, id));
  if (!m) throw new TaskError("NOT_FOUND", "Marco não encontrado");
  if (m.closedAt) throw new TaskError("ARCHIVED_REFERENCE", `Marco “${m.name}” já foi concluído`);
  if (!projectIds.includes(m.projectId))
    throw new TaskError("VALIDATION", "O marco é de outro Projeto/Cliente");
}

async function assertAssignee(tx: Tx, id: string) {
  const [row] = await tx.select({ banned: user.banned }).from(user).where(eq(user.id, id));
  if (!row) throw new TaskError("NOT_FOUND", "Responsável não encontrado");
  if (row.banned) throw new TaskError("ARCHIVED_REFERENCE", "Responsável desativado");
}

/** Primeiro status ativo da categoria, pela ordem do workflow. */
export async function firstStatus(tx: Tx, category: StatusCategory) {
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

/** user/agent: a própria pessoa; automação/sistema: o primeiro admin ativo (ADR-045). */
export async function creatorFor(tx: Tx, actor: Actor) {
  if (actor.kind === "user" || actor.kind === "agent") return actor.userId;
  const [admin] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), or(isNull(user.banned), eq(user.banned, false))))
    .orderBy(asc(user.createdAt))
    .limit(1);
  if (!admin) throw new TaskError("NOT_FOUND", "Nenhum admin para registrar como criador");
  return admin.id;
}

/** Toda escrita começa aqui: trava a linha e só acha a tarefa que o ator vê (ADR-069). */
export async function lockTask(tx: Tx, id: string, actor: Actor) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), visibleTo(actor)))
    .for("update");
  if (!row) throw new TaskError("NOT_FOUND", "Tarefa não encontrada");
  return row;
}

/** ADR-052: conta um uso do template (ativo e do tipo certo). */
export async function countTemplateUse(tx: Tx, id: string, kind: "task" | "project") {
  const [row] = await tx
    .update(templates)
    .set({ usageCount: sql`${templates.usageCount} + 1` })
    .where(and(eq(templates.id, id), eq(templates.kind, kind), isNull(templates.archivedAt)))
    .returning();
  if (!row) throw new TaskError("NOT_FOUND", "Template não encontrado ou arquivado");
  return row;
}

/** `{UM}` no título de template vira o código da primeira UM (sem UM, some). */
export async function unitTitle(tx: Tx, title: string, unitIds: string[]) {
  if (!title.includes("{UM}")) return title;
  const [unit] = unitIds.length
    ? await tx
        .select({ code: mobileUnits.code })
        .from(mobileUnits)
        .where(eq(mobileUnits.id, unitIds[0]))
    : [];
  const out = title
    .replaceAll("{UM}", unit?.code ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!out) throw new TaskError("VALIDATION", "Informe o título");
  return out;
}

// ── Aguardando (ADR-078) ────────────────────────────────────────────

type Waiting = {
  waitingReason: Task["waitingReason"];
  waitingNote: string | null;
  waitingUntil: string | null;
};
const NO_WAITING: Waiting = { waitingReason: null, waitingNote: null, waitingUntil: null };
type WaitingInput = Partial<{
  waitingReason: Task["waitingReason"] | null;
  waitingNote: string | null;
  waitingUntil: string | null;
}>;
const touchesWaiting = (d: WaitingInput) =>
  d.waitingReason != null || !!d.waitingNote || d.waitingUntil != null;

/** Motivo e data prevista completos; data nova não pode ser passada; nota só com "Outro". */
function checkWaiting(w: Waiting, before: Waiting | null): Waiting {
  if (!w.waitingReason || !w.waitingUntil) throw new TaskError("VALIDATION", WAITING_NEEDED);
  const note = w.waitingReason === "other" ? w.waitingNote?.trim() || null : null;
  if (w.waitingReason === "other" && !note) throw new TaskError("VALIDATION", WAITING_NOTE_NEEDED);
  if (w.waitingUntil !== before?.waitingUntil && w.waitingUntil < todayISO())
    throw new TaskError("VALIDATION", WAITING_PAST);
  return { waitingReason: w.waitingReason, waitingNote: note, waitingUntil: w.waitingUntil };
}

const waitingOf = (t: Waiting): Waiting => ({
  waitingReason: t.waitingReason,
  waitingNote: t.waitingNote,
  waitingUntil: t.waitingUntil,
});
const hasWaiting = (t: Waiting) => !!(t.waitingReason || t.waitingUntil || t.waitingNote);

/** ADR-077: confere as referências de uma tarefa a criar sem criá-la (regra de recorrência). */
export async function assertTaskRefs(
  tx: Tx,
  d: {
    projectIds: string[];
    mobileUnitIds: string[];
    labelIds: string[];
    involvedIds: string[];
    assigneeId?: string | null;
  },
) {
  await assertActive(tx, projects, d.projectIds, "Projeto/Cliente");
  await assertActive(tx, mobileUnits, d.mobileUnitIds, "Unidade Móvel");
  await assertUnitsFit(tx, d.mobileUnitIds, d.projectIds, []);
  await assertLabels(tx, d.labelIds);
  await assertInvolved(tx, d.involvedIds);
  if (d.assigneeId) await assertAssignee(tx, d.assigneeId);
}

// ── Escrita ─────────────────────────────────────────────────────────

export async function createTask(actor: Actor, input: CreateTaskInput) {
  const data = createTaskSchema.parse(input);
  return db.transaction((tx) => insertTask(tx, actor, data));
}

/** Cria dentro da transação recebida (templates criam várias de uma vez, ADR-052). */
export async function insertTask(
  tx: Tx,
  actor: Actor,
  data: ReturnType<typeof createTaskSchema.parse>,
  opts: {
    silent?: boolean;
    events?: Parameters<typeof record>[3];
    // ADR-077: a recorrência cria em nome do dono da regra e liga a tarefa a ela
    creatorId?: string;
    recurrence?: { id: string; name: string };
  } = {},
) {
  if (data.templateId) {
    await countTemplateUse(tx, data.templateId, "task");
    data = { ...data, title: await unitTitle(tx, data.title, data.mobileUnitIds) };
  }
  await assertActive(tx, projects, data.projectIds, "Projeto/Cliente");
  await assertActive(tx, mobileUnits, data.mobileUnitIds, "Unidade Móvel");
  await assertUnitsFit(tx, data.mobileUnitIds, data.projectIds, []);
  if (data.descriptionJson)
    data = { ...data, descriptionJson: await relabelMentions(tx, data.descriptionJson) };
  // ADR-069: a pessoal é de uma pessoa (ou do agente dela), sempre atribuída a quem criou
  const personal = data.visibility === "personal";
  if (personal) {
    if (actor.kind !== "user" && actor.kind !== "agent" && !opts.creatorId)
      throw new TaskError("VALIDATION", "Tarefa pessoal só é criada por uma pessoa");
    const owner = opts.creatorId ?? (actor as { userId: string }).userId;
    if (data.assigneeId && data.assigneeId !== owner)
      throw new TaskError("VALIDATION", PERSONAL_OWNER);
    if (data.cycleId || data.milestoneId) throw new TaskError("VALIDATION", PERSONAL_NO_PLANNING);
  }
  // ADR-045: sem responsável automático; omitido = sem responsável
  const creatorId = opts.creatorId ?? (await creatorFor(tx, actor));
  const assigneeId = personal ? creatorId : (data.assigneeId ?? null);
  if (assigneeId) await assertAssignee(tx, assigneeId);
  await assertLabels(tx, data.labelIds);
  await assertInvolved(tx, data.involvedIds);
  if (data.cycleId) await assertCycle(tx, data.cycleId);
  if (data.milestoneId) await assertMilestone(tx, data.milestoneId, data.projectIds);
  const status = data.statusId
    ? await assertStatus(tx, data.statusId)
    : await firstStatus(tx, "todo");
  // ADR-078: criar já em Aguardando exige motivo e previsão
  const waiting =
    status.category === "waiting"
      ? checkWaiting({ ...NO_WAITING, ...data } as Waiting, null)
      : touchesWaiting(data)
        ? (() => {
            throw new TaskError("VALIDATION", WAITING_ONLY);
          })()
        : NO_WAITING;

  const [task] = await tx
    .insert(tasks)
    .values({
      title: data.title,
      projectId: data.projectIds[0] ?? null, // principal (ADR-045); a pessoal pode não ter
      visibility: data.visibility,
      statusId: status.id,
      priority: data.priority,
      assigneeId,
      mobileUnitId: data.mobileUnitIds[0] ?? null,
      glpiTicket: data.glpiTicket,
      dueDate: data.dueDate,
      dueTime: dueTimeFor(data.dueDate, data.dueTime),
      cycleId: data.cycleId ?? null,
      milestoneId: data.milestoneId ?? null,
      descriptionJson: data.descriptionJson,
      descriptionText: docText(data.descriptionJson),
      creatorId,
      createdVia: actor.kind,
      recurrenceId: opts.recurrence?.id ?? null,
      position: await lastPosition(tx, status.id),
      completedAt: status.category === "done" ? new Date() : null,
      ...waiting,
    })
    .returning();

  await writeLinks(tx, task.id, data.projectIds, data.mobileUnitIds);
  if (data.labelIds.length)
    await tx
      .insert(taskLabels)
      .values(data.labelIds.map((labelId) => ({ taskId: task.id, labelId })));
  const involved = [...new Set(data.involvedIds)];
  if (involved.length)
    await tx
      .insert(taskInvolved)
      .values(involved.map((involvedId) => ({ taskId: task.id, involvedId })));
  let pos: string | null = null;
  for (const text of data.checklist) {
    pos = generateKeyBetween(pos, null);
    await tx.insert(checklistItems).values({ taskId: task.id, text, position: pos });
  }
  const created = opts.recurrence
    ? { recurrenceId: opts.recurrence.id, recurrence: opts.recurrence.name }
    : undefined;
  await record(
    tx,
    actor,
    task.id,
    [{ type: "created", payload: created }, ...(opts.events ?? [])],
    {
      silent: opts.silent,
    },
  );
  return task;
}

const FIELDS = ["title", "priority", "glpiTicket", "dueDate", "dueTime"] as const;

/** ADR-072: hora só com data; sem data a hora some. */
function dueTimeFor(date: string | null | undefined, time: string | null | undefined) {
  if (time && !date) throw new TaskError("VALIDATION", DUE_TIME_NEEDS_DATE);
  return date ? (time ?? null) : null;
}
/** No patch: limpar a data limpa a hora; hora nova exige data (a do patch ou a atual). */
function patchDueTime<T extends { dueDate?: string | null; dueTime?: string | null }>(
  data: T,
  current: { dueDate: string | null },
): T {
  const date = "dueDate" in data ? data.dueDate : current.dueDate;
  if ("dueTime" in data || ("dueDate" in data && !date))
    return { ...data, dueTime: dueTimeFor(date, "dueTime" in data ? data.dueTime : null) };
  return data;
}

/** Aplica a mudança já validada dentro da transação; devolve a tarefa nova. */
async function applyUpdate(
  tx: Tx,
  actor: Actor,
  current: Task,
  data: ReturnType<typeof updateTaskSchema.parse>,
  // ADR-082: o Desfazer devolve a previsão antiga do Aguardando, mesmo que já tenha passado
  { restoring = false }: { restoring?: boolean } = {},
) {
  data = patchDueTime(data, current);
  // ADR-045: confere a combinação resultante de projetos e UMs
  const linked = await linkedIds(tx, current.id);
  const projectsAfter = data.projectIds ?? linked.projectIds;
  const unitsAfter = data.mobileUnitIds ?? linked.unitIds;
  const added = (after: string[], before: string[]) => after.filter((id) => !before.includes(id));
  // ADR-069: pessoal → equipe exige Projeto/Cliente; o caminho inverso não existe
  const toTeam = data.visibility === "team" && current.visibility === "personal";
  if (current.visibility === "personal" && !toTeam) {
    if ("assigneeId" in data && data.assigneeId !== current.creatorId)
      throw new TaskError("VALIDATION", PERSONAL_OWNER);
    if (data.cycleId || data.milestoneId) throw new TaskError("VALIDATION", PERSONAL_NO_PLANNING);
  } else if (projectsAfter.length === 0)
    throw new TaskError("VALIDATION", toTeam ? TEAM_NEEDS_PROJECT : TASK_NEEDS_PROJECT);
  if (data.projectIds || data.mobileUnitIds) {
    await assertActive(tx, projects, added(projectsAfter, linked.projectIds), "Projeto/Cliente");
    await assertActive(tx, mobileUnits, added(unitsAfter, linked.unitIds), "Unidade Móvel");
    await assertUnitsFit(
      tx,
      unitsAfter,
      projectsAfter,
      linked.projectIds.filter((id) => !projectsAfter.includes(id)),
    );
  }
  if (data.assigneeId && data.assigneeId !== current.assigneeId)
    await assertAssignee(tx, data.assigneeId);
  if (data.cycleId && data.cycleId !== current.cycleId) await assertCycle(tx, data.cycleId);
  const milestoneAfter = "milestoneId" in data ? (data.milestoneId ?? null) : current.milestoneId;
  if (milestoneAfter && milestoneAfter !== current.milestoneId)
    await assertMilestone(tx, milestoneAfter, projectsAfter);
  else if (milestoneAfter && data.projectIds) {
    // marco mantido: tirar o projeto dele da tarefa não pode deixá-lo órfão
    const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestoneAfter));
    if (m && !projectsAfter.includes(m.projectId))
      throw new TaskError("VALIDATION", "Tire o marco antes de remover o Projeto/Cliente dele");
  }

  const set: Partial<typeof tasks.$inferInsert> = {};
  const events: Parameters<typeof record>[3] = [];
  if (toTeam) {
    // ADR-079: dependência pessoal não vira dependência da equipe em silêncio
    const [dep] = await tx
      .select({ k: taskLinks.kind })
      .from(taskLinks)
      .where(
        and(
          eq(taskLinks.kind, "blocks"),
          or(eq(taskLinks.fromTaskId, current.id), eq(taskLinks.toTaskId, current.id)),
        ),
      )
      .limit(1);
    if (dep)
      throw new TaskError("VALIDATION", "Remova as dependências antes de mover para a equipe");
    // antes do record(): o evento da conversão já sai como tarefa da equipe (SSE e notificações)
    // o projeto principal vai junto: o CHECK do banco não aceita tarefa da equipe sem projeto
    await tx
      .update(tasks)
      .set({ visibility: "team", projectId: projectsAfter[0] })
      .where(eq(tasks.id, current.id));
    events.push({
      type: "field_changed",
      payload: { field: "visibility", from: "personal", to: "team" },
    });
  }

  for (const field of FIELDS) {
    if (!(field in data)) continue;
    /* eslint-disable security/detect-object-injection -- `field` vem da lista fixa FIELDS */
    const [from, to] = [current[field], data[field]];
    /* eslint-enable security/detect-object-injection */
    if (to === from) continue;
    Object.assign(set, { [field]: to });
    events.push({ type: "field_changed", payload: { field, from, to } });
  }
  const projectsChanged = !sameSet(projectsAfter, linked.projectIds);
  const unitsChanged = !sameSet(unitsAfter, linked.unitIds);
  if (projectsChanged)
    events.push({
      type: "projects_changed",
      payload: { from: linked.projectIds, to: projectsAfter },
    });
  if (unitsChanged)
    events.push({
      type: "mobile_units_changed",
      payload: { from: linked.unitIds, to: unitsAfter },
    });
  await writeLinks(
    tx,
    current.id,
    projectsChanged ? projectsAfter : null,
    unitsChanged ? unitsAfter : null,
  );
  // principal só muda quando a lista vem no patch; linkedIds() não tem ordem (M-029)
  if (data.projectIds && (projectsAfter[0] ?? null) !== current.projectId)
    set.projectId = projectsAfter[0] ?? null;
  if (data.mobileUnitIds && (unitsAfter[0] ?? null) !== current.mobileUnitId)
    set.mobileUnitId = unitsAfter[0] ?? null;
  if ("assigneeId" in data && data.assigneeId !== current.assigneeId) {
    set.assigneeId = data.assigneeId;
    events.push({ type: "assigned", payload: { from: current.assigneeId, to: data.assigneeId } });
  }
  for (const [key, field] of [
    ["cycleId", "cycle"],
    ["milestoneId", "milestone"],
  ] as const) {
    if (!(key in data)) continue;
    /* eslint-disable security/detect-object-injection -- chaves da lista fixa acima */
    const [from, to] = [current[key], data[key] ?? null];
    /* eslint-enable security/detect-object-injection */
    if (to === from) continue;
    Object.assign(set, { [key]: to });
    events.push({ type: "field_changed", payload: { field, from, to } });
  }
  if (data.descriptionJson)
    data = { ...data, descriptionJson: await relabelMentions(tx, data.descriptionJson) };
  if (
    "descriptionJson" in data &&
    stable(data.descriptionJson) !== stable(current.descriptionJson)
  ) {
    set.descriptionJson = data.descriptionJson;
    set.descriptionText = docText(data.descriptionJson);
    if (set.descriptionText !== current.descriptionText)
      events.push({
        type: "field_changed",
        payload: {
          field: "description",
          // ADR-050: só os mencionados novos são avisados
          mentions: mentionIds(set.descriptionJson).filter(
            (id) => !mentionIds(current.descriptionJson).includes(id),
          ),
        },
      });
  }
  const statusChanged = !!data.statusId && data.statusId !== current.statusId;
  const [fromStatus] = await tx
    .select()
    .from(workflowStatuses)
    .where(eq(workflowStatuses.id, current.statusId));
  const toStatus = statusChanged ? await assertStatus(tx, data.statusId!) : fromStatus;
  // ADR-078: entrar no Aguardando exige motivo e previsão; sair limpa; dentro dele, edita
  const wasWaiting = fromStatus?.category === "waiting";
  const before = waitingOf(current);
  const statusExtra: Record<string, unknown> = {};
  if (toStatus.category === "waiting") {
    const touched = "waitingReason" in data || "waitingNote" in data || "waitingUntil" in data;
    if (!wasWaiting || touched) {
      const after = checkWaiting(
        {
          waitingReason:
            "waitingReason" in data ? (data.waitingReason ?? null) : before.waitingReason,
          waitingNote: "waitingNote" in data ? (data.waitingNote ?? null) : before.waitingNote,
          waitingUntil: "waitingUntil" in data ? (data.waitingUntil ?? null) : before.waitingUntil,
        },
        wasWaiting ? before : restoring ? (data as Waiting) : null,
      );
      Object.assign(set, after);
      if (!wasWaiting) statusExtra.waiting = after;
      else if (stable(after) !== stable(before))
        events.push({
          type: "field_changed",
          payload: { field: "waiting", from: before, to: after },
        });
    }
  } else {
    if (touchesWaiting(data)) throw new TaskError("VALIDATION", WAITING_ONLY);
    if (hasWaiting(before)) {
      Object.assign(set, NO_WAITING);
      statusExtra.waitingCleared = before;
    }
  }
  if (statusChanged && toStatus.category === "done" && fromStatus?.category !== "done")
    await releaseBlocked(tx, actor, current);
  if (statusChanged) {
    set.statusId = toStatus.id; // ADR-081: sem position, o Kanban ordena sozinho
    Object.assign(set, completion(fromStatus?.category, toStatus.category, current.completedAt));
    events.push({
      type: "status_changed",
      payload: { from: current.statusId, to: toStatus.id, ...statusExtra },
    });
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
  if (data.involvedIds) {
    const before = (
      await tx
        .select({ id: taskInvolved.involvedId })
        .from(taskInvolved)
        .where(eq(taskInvolved.taskId, current.id))
    ).map((r) => r.id);
    const after = [...new Set(data.involvedIds)];
    await assertInvolved(
      tx,
      after.filter((id) => !before.includes(id)),
    );
    if (!sameSet(after, before)) {
      await tx.delete(taskInvolved).where(eq(taskInvolved.taskId, current.id));
      if (after.length)
        await tx
          .insert(taskInvolved)
          .values(after.map((involvedId) => ({ taskId: current.id, involvedId })));
      events.push({ type: "involved_changed", payload: { from: before, to: after } });
    }
  }

  const ids = await record(tx, actor, current.id, events);
  // ADR-082: o Desfazer aponta só para a mudança de status gravada nesta chamada
  const statusEventId = ids[events.findIndex((e) => e.type === "status_changed")] ?? null;
  if (Object.keys(set).length === 0 && events.length === 0) return { ...current, statusEventId };
  const [row] = await tx
    .update(tasks)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(tasks.id, current.id))
    .returning();
  return { ...row, statusEventId };
}

/** ADR-022: entrar em `done` grava completedAt; sair limpa. */
function completion(from: string | undefined, to: string, completedAt: Date | null) {
  if (to === "done" && from !== "done") return { completedAt: new Date() };
  if (to !== "done") return { completedAt: null };
  return { completedAt };
}

export async function updateTask(actor: Actor, taskId: string, input: UpdateTaskInput) {
  const data = updateTaskSchema.parse(input);
  return db.transaction(async (tx) =>
    applyUpdate(tx, actor, await lockTask(tx, taskId, actor), data),
  );
}

/** Kanban: muda o status (ADR-081: a ordem da coluna é calculada, sem posição manual). */
export async function moveTask(
  actor: Actor,
  taskId: string,
  input: z.input<typeof moveTaskSchema>,
) {
  const data = moveTaskSchema.parse(input);
  return db.transaction(async (tx) =>
    applyUpdate(tx, actor, await lockTask(tx, taskId, actor), data),
  );
}

export const UNDO_STALE = "A tarefa mudou desde então";

/**
 * ADR-082: volta o status de uma mudança feita pela própria pessoa, se nada aconteceu na tarefa
 * depois dela. Evento novo (task_events é só-inserção); restaura o Aguardando do evento.
 */
export async function undoStatusChange(actor: Actor, taskId: string, eventId: string) {
  if (actor.kind !== "user") throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId, actor);
    const [ev] = await tx
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.id, eventId), eq(taskEvents.taskId, current.id)));
    if (
      !ev ||
      ev.type !== "status_changed" ||
      ev.actorKind !== "user" ||
      ev.actorUserId !== actor.userId
    )
      throw new TaskError("NOT_FOUND", "Nada a desfazer");
    const [later] = await tx
      .select({ id: taskEvents.id })
      .from(taskEvents)
      // no SQL: o Date do JS corta os microssegundos e o próprio evento pareceria "depois"
      .where(
        and(
          eq(taskEvents.taskId, current.id),
          sql`${taskEvents.createdAt} > (SELECT e.created_at FROM ${taskEvents} e WHERE e.id = ${ev.id})`,
        ),
      )
      .limit(1);
    const payload = ev.payload as { from?: string; to?: string; waitingCleared?: Waiting };
    if (later || current.statusId !== payload.to || !payload.from)
      throw new TaskError("VALIDATION", UNDO_STALE);
    const waiting = payload.waitingCleared;
    return applyUpdate(
      tx,
      actor,
      current,
      updateTaskSchema.parse({ statusId: payload.from, ...waiting }),
      { restoring: !!waiting },
    );
  });
}

/** Move para o primeiro status `done`; idempotente (API.md › complete_task). */
export async function completeTask(actor: Actor, taskId: string) {
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId, actor);
    if (current.completedAt) return { ...current, statusEventId: null };
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
    for (const id of taskIds)
      out.push(await applyUpdate(tx, actor, await lockTask(tx, id, actor), patch));
    return out;
  });
}

/**
 * ADR-063: exclusão definitiva, tudo ou nada. Rastro em `task_deletions`; o cascade leva checklist,
 * vínculos, comentários, eventos, anexos e avisos. Os arquivos saem do volume depois do commit.
 */
export async function deleteTasks(actor: Actor, input: { taskIds: string[] }) {
  if (actor.kind !== "user") throw new ForbiddenError();
  const { taskIds } = deleteTasksSchema.parse(input);
  const keys = await db.transaction(async (tx) => {
    const rows = [];
    for (const id of taskIds) {
      // pessoal de outra pessoa: NOT_FOUND, até para o admin (ADR-069)
      const task = await lockTask(tx, id, actor);
      if (!canDeleteTask(actor, task)) throw new ForbiddenError();
      rows.push(task);
    }
    const files = await tx
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.taskId, taskIds));
    await tx.insert(taskDeletions).values(
      rows.map((t) => ({
        number: t.number,
        // ADR-069: o rastro não guarda o conteúdo de uma tarefa pessoal
        title: t.visibility === "personal" ? "(tarefa pessoal)" : t.title,
        deletedBy: actor.userId,
      })),
    );
    // ADR-079: a tarefa do outro lado de uma dependência registra que ela sumiu
    const deps = await tx
      .select()
      .from(taskLinks)
      .where(
        and(
          eq(taskLinks.kind, "blocks"),
          or(inArray(taskLinks.fromTaskId, taskIds), inArray(taskLinks.toTaskId, taskIds)),
        ),
      );
    const others = deps.length
      ? await tx
          .select({ id: tasks.id, visibility: tasks.visibility })
          .from(tasks)
          .where(inArray(tasks.id, [...new Set(deps.flatMap((d) => [d.fromTaskId, d.toTaskId]))]))
      : [];
    for (const d of deps) {
      const fromGone = taskIds.includes(d.fromTaskId);
      const [gone, other] = fromGone ? [d.fromTaskId, d.toTaskId] : [d.toTaskId, d.fromTaskId];
      if (taskIds.includes(other)) continue;
      const goneTask = rows.find((r) => r.id === gone)!;
      // vínculo antigo entre pessoal e equipe não registra (nem vaza) o número (M-158)
      if (others.find((o) => o.id === other)?.visibility !== goneTask.visibility) continue;
      const number = goneTask.number;
      await record(tx, actor, other, [
        {
          type: "dependency_removed",
          payload: { kind: fromGone ? "blocked_by" : "blocks", target: number, deleted: true },
        },
      ]);
    }
    // ADR-048: a aba com a tarefa aberta recarrega e cai no 404
    for (const t of rows)
      await tx.execute(
        sql`SELECT pg_notify('task_changed', json_build_object('id', ${t.id}::text, 'number', ${t.number}::int, 'fields', '["deleted"]'::json, 'by', ${actor.userId}::text, 'owner', ${t.visibility === "personal" ? t.creatorId : null}::text)::text)`,
      );
    // M-158: excluir a última bloqueadora aberta libera como concluir (ADR-079)
    const ids = sql`(${sql.join(
      taskIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
    const { rows: candidates } = await tx.execute<{ id: string; by: number }>(sql`
      SELECT DISTINCT ON (t.id) t.id, b.number AS by FROM task_links l
      JOIN tasks b ON b.id = l.from_task_id
      JOIN workflow_statuses bs ON bs.id = b.status_id
      JOIN tasks t ON t.id = l.to_task_id
      JOIN workflow_statuses ts ON ts.id = t.status_id
      WHERE l.kind = 'blocks' AND l.from_task_id IN ${ids}
        AND t.id NOT IN ${ids}
        AND bs.category <> 'done' AND ts.category <> 'done' AND b.visibility = t.visibility
      ORDER BY t.id, b.number`);
    await tx.delete(tasks).where(inArray(tasks.id, taskIds));
    for (const c of candidates) {
      const { rows: still } = await tx.execute(
        sql`SELECT 1 WHERE ${openBlocker(sql`${c.id}::uuid`)}`,
      );
      if (!still.length)
        await record(tx, actor, c.id, [
          { type: "unblocked", payload: { by: Number(c.by), deleted: true } },
        ]);
    }
    return files.map((f) => f.key);
  });
  await removeStoredFiles(keys);
  return taskIds.length;
}

// ── Subtarefas (checklist) ──────────────────────────────────────────

export async function addChecklistItem(actor: Actor, taskId: string, text: string) {
  const value = checklistTextSchema.parse(text);
  return db.transaction(async (tx) => {
    await lockTask(tx, taskId, actor);
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
  input: {
    text?: string;
    done?: boolean;
    assigneeId?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
  },
) {
  const parsed = checklistItemSchema.parse(input);
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item) throw new TaskError("NOT_FOUND", "Subtarefa não encontrada");
    const data = patchDueTime(parsed, item);
    await lockTask(tx, item.taskId, actor);
    if (data.assigneeId && data.assigneeId !== item.assigneeId)
      await assertAssignee(tx, data.assigneeId);
    const [row] = await tx
      .update(checklistItems)
      .set(data)
      .where(eq(checklistItems.id, itemId))
      .returning();
    const action =
      "done" in data && data.done !== item.done
        ? data.done
          ? "checked"
          : "unchecked"
        : ("dueDate" in data && data.dueDate !== item.dueDate) ||
            ("dueTime" in data && data.dueTime !== item.dueTime)
          ? row.dueDate
            ? "due_set"
            : "due_cleared"
          : "edited";
    await record(tx, actor, item.taskId, [
      {
        type: "checklist_changed",
        payload: {
          action,
          text: row.text,
          // Módulo 18, item 19: edição do texto guarda o de → para no histórico
          ...(action === "edited" && row.text !== item.text && { from: item.text }),
          ...(action === "due_set" && { dueDate: row.dueDate, dueTime: row.dueTime }),
        },
      },
    ]);
    return row;
  });
}

export async function removeChecklistItem(actor: Actor, itemId: string) {
  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!found) throw new TaskError("NOT_FOUND", "Subtarefa não encontrada");
    await lockTask(tx, found.taskId, actor);
    const [item] = await tx.delete(checklistItems).where(eq(checklistItems.id, itemId)).returning();
    await record(tx, actor, item.taskId, [
      { type: "checklist_changed", payload: { action: "removed", text: item.text } },
    ]);
  });
}

// ── Vínculos e dependências (ADR-079) ───────────────────────────────

const DEPENDENCY_SCOPE = "Dependência só entre tarefas da equipe, ou entre tarefas pessoais suas";
const INVERSE = { blocks: "blocked_by", blocked_by: "blocks" } as const;

async function linkRow(
  tx: Tx,
  actor: Actor,
  current: Task,
  input: { kind: string; target: unknown },
) {
  const { kind, target } = linkSchema.parse(input);
  // ADR-069: só se vincula ao que o ator vê; pessoal de outra pessoa = não existe
  const [other] = await tx
    .select({ id: tasks.id, number: tasks.number, visibility: tasks.visibility })
    .from(tasks)
    .where(and(eq(tasks.number, target), visibleTo(actor)));
  if (!other) throw new TaskError("NOT_FOUND", `TI-${target} não encontrada`);
  if (other.id === current.id)
    throw new TaskError("VALIDATION", "Uma tarefa não se vincula a ela mesma");
  const dependency = kind !== "relates";
  // ADR-079: equipe com equipe; pessoal com pessoal (as duas visíveis = do mesmo dono)
  if (dependency && other.visibility !== current.visibility)
    throw new TaskError("VALIDATION", DEPENDENCY_SCOPE);
  // "bloqueada por" é o mesmo vínculo `blocks` visto do outro lado
  const row =
    kind === "blocked_by"
      ? { fromTaskId: other.id, toTaskId: current.id, kind: "blocks" as const }
      : { fromTaskId: current.id, toTaskId: other.id, kind: kind as "blocks" | "relates" };
  return { row, kind, other, dependency };
}

/** A partir de `start`, seguindo "bloqueia", chega em `target`? */
async function reaches(tx: Tx, start: string, target: string) {
  // só pela mesma visibilidade: vínculo antigo entre pessoal e equipe não conta (M-158)
  const { rows } = await tx.execute(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT l.to_task_id FROM task_links l
      JOIN tasks a ON a.id = l.from_task_id JOIN tasks b ON b.id = l.to_task_id
      WHERE l.from_task_id = ${start} AND l.kind = 'blocks' AND a.visibility = b.visibility
      UNION
      SELECT l.to_task_id FROM task_links l JOIN reach r ON l.from_task_id = r.id
      JOIN tasks a ON a.id = l.from_task_id JOIN tasks b ON b.id = l.to_task_id
      WHERE l.kind = 'blocks' AND a.visibility = b.visibility
    )
    SELECT 1 FROM reach WHERE id = ${target} LIMIT 1`);
  return rows.length > 0;
}

/** Eventos nos dois lados: `dependency_*` para bloqueio, `link_*` para "relacionada a". */
async function recordLink(
  tx: Tx,
  actor: Actor,
  current: Task,
  link: Awaited<ReturnType<typeof linkRow>>,
  action: "added" | "removed",
) {
  if (!link.dependency)
    return record(tx, actor, current.id, [
      {
        type: action === "added" ? "link_added" : "link_removed",
        payload: { kind: link.kind, target: link.other.number },
      },
    ]);
  const type = action === "added" ? "dependency_added" : "dependency_removed";
  const kind = link.kind as keyof typeof INVERSE;
  await record(tx, actor, current.id, [{ type, payload: { kind, target: link.other.number } }]);
  const inverse = kind === "blocks" ? INVERSE.blocks : INVERSE.blocked_by;
  await record(tx, actor, link.other.id, [
    { type, payload: { kind: inverse, target: current.number } },
  ]);
}

export async function addLink(
  actor: Actor,
  taskId: string,
  input: { kind: string; target: unknown },
) {
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId, actor);
    const link = await linkRow(tx, actor, current, input);
    if (link.dependency) {
      // ponytail: um lock para toda escrita de dependência (time de 4); por par se crescer
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('task_dependencies'))`);
      if (await reaches(tx, link.row.toTaskId, link.row.fromTaskId))
        throw new TaskError(
          "VALIDATION",
          `TI-${link.other.number} e TI-${current.number} já dependem uma da outra: criaria um ciclo`,
        );
    }
    const inserted = await tx.insert(taskLinks).values(link.row).onConflictDoNothing().returning();
    if (inserted.length) await recordLink(tx, actor, current, link, "added");
  });
}

export async function removeLink(
  actor: Actor,
  taskId: string,
  input: { kind: string; target: unknown },
) {
  return db.transaction(async (tx) => {
    const current = await lockTask(tx, taskId, actor);
    const link = await linkRow(tx, actor, current, input);
    const { row } = link;
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
    if (removed.length) await recordLink(tx, actor, current, link, "removed");
  });
}

/** Há bloqueadora aberta (não concluída) da tarefa, fora `except`? Só da mesma visibilidade (ADR-069). */
const openBlocker = (taskId: SQL, except?: string) => sql`EXISTS (
  SELECT 1 FROM task_links bl
  JOIN tasks b ON b.id = bl.from_task_id
  JOIN workflow_statuses bs ON bs.id = b.status_id
  JOIN tasks bt ON bt.id = bl.to_task_id
  WHERE bl.to_task_id = ${taskId} AND bl.kind = 'blocks' AND bs.category <> 'done'
    AND b.visibility = bt.visibility
  ${except ? sql`AND bl.from_task_id <> ${except}` : sql``})`;

/** Ao concluir: avisa as tarefas que ficaram sem bloqueadora aberta (ADR-079). */
async function releaseBlocked(tx: Tx, actor: Actor, current: Task) {
  const freed = await tx
    .select({ id: tasks.id })
    .from(taskLinks)
    .innerJoin(tasks, eq(tasks.id, taskLinks.toTaskId))
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(
      and(
        eq(taskLinks.fromTaskId, current.id),
        eq(taskLinks.kind, "blocks"),
        // vínculo antigo entre pessoal e equipe (antes do ADR-079) não avisa nem vaza o número
        eq(tasks.visibility, current.visibility),
        ne(workflowStatuses.category, "done"),
        sql`NOT ${openBlocker(sql`${tasks.id}`, current.id)}`,
      ),
    );
  for (const t of freed)
    await record(tx, actor, t.id, [{ type: "unblocked", payload: { by: current.number } }]);
}

// ── Leitura ─────────────────────────────────────────────────────────

const assignee = alias(user, "assignee");

/** Detalhe da tarefa pelo número visível (ADR-021). */
export async function getTaskByNumber(actor: Actor, number: number) {
  // ADR-069: pessoal de outra pessoa não existe para quem lê (a página dá 404)
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.number, number), visibleTo(actor)));
  if (!task) return null;
  const [labelRows, checklist, linkRows, [refs], projectRows, unitRows, involvedRows] =
    await Promise.all([
      db
        .select({ id: labels.id, name: labels.name, colorToken: labels.colorToken })
        .from(taskLabels)
        .innerJoin(labels, eq(labels.id, taskLabels.labelId))
        .where(eq(taskLabels.taskId, task.id))
        .orderBy(asc(labels.name)),
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
        // `tasks` aqui é a outra ponta: vínculo com tarefa que o leitor não vê não aparece
        .where(
          and(
            or(eq(taskLinks.fromTaskId, task.id), eq(taskLinks.toTaskId, task.id)),
            visibleTo(actor),
          ),
        )
        .orderBy(asc(tasks.number)),
      // nomes atuais mesmo de cadastro arquivado ou pessoa desativada (não aparecem nos seletores)
      db
        .select({
          statusName: workflowStatuses.name,
          category: workflowStatuses.category,
          creatorName: user.name,
          assigneeName: assignee.name,
          cycleNumber: cycles.number,
          milestoneName: milestones.name,
          recurrenceName: taskRecurrences.name, // ADR-077
        })
        .from(tasks)
        .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
        .innerJoin(user, eq(user.id, tasks.creatorId))
        .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
        .leftJoin(cycles, eq(cycles.id, tasks.cycleId))
        .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
        .leftJoin(taskRecurrences, eq(taskRecurrences.id, tasks.recurrenceId))
        .where(eq(tasks.id, task.id)),
      // ADR-045: o principal primeiro
      db
        .select({
          id: projects.id,
          code: projects.code,
          name: projects.name,
          color: projects.color,
        })
        .from(taskProjects)
        .innerJoin(projects, eq(projects.id, taskProjects.projectId))
        .where(eq(taskProjects.taskId, task.id))
        .orderBy(sql`${projects.id} = ${task.projectId} DESC`, asc(projects.code)),
      db
        .select({
          id: mobileUnits.id,
          code: mobileUnits.code,
          projectId: mobileUnits.projectId,
          color: projects.color, // ADR-068: a UM herda a cor do projeto dela
        })
        .from(taskMobileUnits)
        .innerJoin(mobileUnits, eq(mobileUnits.id, taskMobileUnits.mobileUnitId))
        .leftJoin(projects, eq(projects.id, mobileUnits.projectId))
        .where(eq(taskMobileUnits.taskId, task.id))
        .orderBy(asc(mobileUnits.code)),
      db
        .select({ id: involvedPeople.id, name: involvedPeople.name })
        .from(taskInvolved)
        .innerJoin(involvedPeople, eq(involvedPeople.id, taskInvolved.involvedId))
        .where(eq(taskInvolved.taskId, task.id))
        .orderBy(asc(involvedPeople.name)),
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
  return {
    ...task,
    ...refs,
    labels: labelRows,
    projects: projectRows,
    units: unitRows,
    involved: involvedRows,
    checklist,
    links,
  };
}

/** Pessoas ativas para os seletores de responsável. */
export async function listAssignees() {
  return db
    .select({ id: user.id, name: user.name, initials: user.initials })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(asc(user.name));
}

/** Templates de tarefa ativos e válidos, os mais usados primeiro (criação rápida). */
export async function listTaskTemplates() {
  const rows = await db
    .select({ id: templates.id, name: templates.name, payload: templates.payload })
    .from(templates)
    .where(and(eq(templates.kind, "task"), isNull(templates.archivedAt)))
    .orderBy(desc(templates.usageCount));
  return rows.flatMap((t) => {
    const payload = taskTemplatePayloadSchema.safeParse(t.payload);
    return payload.success ? [{ id: t.id, name: t.name, payload: payload.data }] : [];
  });
}

// ── Atrasadas (Módulo 18) ───────────────────────────────────────────

/** A regra do `isLate` (src/lib/dates.ts) em SQL: prazo vencido, fora de Concluído e Aguardando. */
function lateSql(now = new Date()) {
  const today = todayISO(now);
  return sql`(${workflowStatuses.category} NOT IN ('done', 'waiting') AND (${tasks.dueDate} < ${today}
    OR (${tasks.dueDate} = ${today} AND ${tasks.dueTime} <= ${nowHM(now)})))`;
}

/**
 * Contador da navegação: minhas atrasadas (responsável sou eu, pessoais incluídas) e as da
 * equipe (teamOnly). Uma contagem agregada; vale o visibleTo(actor).
 */
export async function countLate(actor: Actor) {
  const mine = actor.kind === "user" || actor.kind === "agent" ? actor.userId : null;
  const [row] = await db
    .select({
      mine: sql<number>`count(*) FILTER (WHERE ${tasks.assigneeId} = ${mine})::int`,
      team: sql<number>`count(*) FILTER (WHERE ${teamOnly})::int`,
    })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(and(isNull(tasks.archivedAt), visibleTo(actor), lateSql()));
  return { mine: row?.mine ?? 0, team: row?.team ?? 0 };
}

// ── Visões (ADR-046) ────────────────────────────────────────────────

export const LIST_LIMIT = 1000;
/** Módulo 18: dias de concluídas no Kanban (data de conclusão em Brasília; hoje conta). */
export const RECENT_DONE_DAYS = 14;

/**
 * Kanban, Lista, Calendário e Minhas tarefas: tarefas não arquivadas que passam nos filtros.
 * ADR-047: abertas sem limite; concluídas por `completed_at desc` com limite (`truncated`);
 * `recentDone` (Kanban) só traz concluídas dos últimos 14 dias.
 */
export async function listTasks(
  actor: Actor,
  input: Partial<TaskFilters>,
  scope: {
    // ADR-069: `team` (padrão) = visões da equipe, sem pessoais nem para o dono; `personal` = só
    // as pessoais de quem lê; `all` = as duas. Em todos os casos vale o visibleTo(actor).
    visibility?: "team" | "personal" | "all";
    assigneeId?: string;
    creatorId?: string;
    mentionedUserId?: string;
    openOnly?: boolean;
    recentDone?: boolean;
    doneLimit?: number;
  } = {},
) {
  const f = taskFiltersSchema.parse(input);
  const doneLimit = scope.doneLimit ?? LIST_LIMIT;
  const any = <T>(ids: T[], cond: (ids: T[]) => ReturnType<typeof inArray>) =>
    ids.length ? cond(ids) : undefined;
  const query = (extra: SQL | undefined) =>
    db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        creatorId: tasks.creatorId,
        createdVia: tasks.createdVia,
        visibility: tasks.visibility,
        priority: tasks.priority,
        statusId: tasks.statusId,
        category: workflowStatuses.category,
        position: tasks.position,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
        createdAt: tasks.createdAt, // ADR-081: ordem do Kanban
        completedAt: tasks.completedAt,
        // Módulo 18: card compacto do Concluído mostra quem concluiu (último status_changed)
        completedBy: sql<{
          name: string;
          initials: string;
        } | null>`CASE WHEN ${workflowStatuses.category} = 'done' THEN (
          SELECT json_build_object('name', u.name, 'initials', u.initials)
          FROM ${user} u WHERE u.id = (
            SELECT e.actor_user_id FROM ${taskEvents} e
            WHERE e.task_id = ${tasks.id} AND e.type = 'status_changed'
            ORDER BY e.created_at DESC LIMIT 1)) END`, // automação (sem pessoa) = sem avatar
        recurrenceId: tasks.recurrenceId, // ADR-077: selo no card
        blocked: sql<boolean>`${openBlocker(sql`${tasks.id}`)}`, // ADR-079
        waitingReason: tasks.waitingReason, // ADR-078
        waitingNote: tasks.waitingNote,
        waitingUntil: tasks.waitingUntil,
        // Módulo 16: progresso das subtarefas no card, na mesma consulta (sem N+1)
        checklistTotal: sql<number>`(SELECT count(*)::int FROM ${checklistItems} WHERE ${checklistItems.taskId} = ${tasks.id})`,
        checklistDone: sql<number>`(SELECT count(*)::int FROM ${checklistItems} WHERE ${checklistItems.taskId} = ${tasks.id} AND ${checklistItems.done})`,
        glpiTicket: tasks.glpiTicket,
        assigneeId: tasks.assigneeId,
        assigneeName: assignee.name,
        assigneeInitials: assignee.initials,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
      .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(
        and(
          isNull(tasks.archivedAt),
          visibleTo(actor),
          scope.visibility === "all"
            ? undefined
            : scope.visibility === "personal"
              ? eq(tasks.visibility, "personal")
              : teamOnly,
          any(f.statusIds, (ids) => inArray(tasks.statusId, ids)),
          any(f.assigneeIds, (ids) => inArray(tasks.assigneeId, ids)),
          any(f.priorities, (ids) => inArray(tasks.priority, ids)),
          any(f.cycleIds, (ids) => inArray(tasks.cycleId, ids)),
          any(f.waitingReasons, (ids) => inArray(tasks.waitingReason, ids)),
          f.blocked.length ? openBlocker(sql`${tasks.id}`) : undefined,
          f.overdue.length ? lateSql() : undefined, // Módulo 18
          // Módulo 18: a busca do ⌘K como filtro; texto sem critério não acha nada
          f.q.length ? (searchCriteria(f.q[0])?.where ?? sql`false`) : undefined,
          // ADR-045: qualquer vínculo, não só o principal
          any(f.projectIds, (ids) =>
            inArray(
              tasks.id,
              db
                .select({ id: taskProjects.taskId })
                .from(taskProjects)
                .where(inArray(taskProjects.projectId, ids)),
            ),
          ),
          any(f.mobileUnitIds, (ids) =>
            inArray(
              tasks.id,
              db
                .select({ id: taskMobileUnits.taskId })
                .from(taskMobileUnits)
                .where(inArray(taskMobileUnits.mobileUnitId, ids)),
            ),
          ),
          // ADR-073: qualquer um dos envolvidos escolhidos
          any(f.involvedIds, (ids) =>
            inArray(
              tasks.id,
              db
                .select({ id: taskInvolved.taskId })
                .from(taskInvolved)
                .where(inArray(taskInvolved.involvedId, ids)),
            ),
          ),
          any(f.labelIds, (ids) =>
            inArray(
              tasks.id,
              db
                .select({ id: taskLabels.taskId })
                .from(taskLabels)
                .where(inArray(taskLabels.labelId, ids)),
            ),
          ),
          scope.assigneeId ? eq(tasks.assigneeId, scope.assigneeId) : undefined,
          scope.creatorId ? eq(tasks.creatorId, scope.creatorId) : undefined,
          scope.mentionedUserId
            ? inArray(
                tasks.id,
                db
                  .select({ id: comments.taskId })
                  .from(comments)
                  .where(sql`${comments.mentions} @> ARRAY[${scope.mentionedUserId}]::text[]`),
              )
            : undefined,
          extra,
        ),
      );
  const done = eq(workflowStatuses.category, "done");
  const [open, closed] = await Promise.all([
    query(ne(workflowStatuses.category, "done")),
    scope.openOnly
      ? []
      : query(
          // Módulo 18: com busca, as antigas que casam também aparecem (nada fica escondido)
          scope.recentDone && !f.q.length
            ? and(
                done,
                sql`(${tasks.completedAt} AT TIME ZONE 'America/Sao_Paulo')::date > ${addDays(todayISO(), -RECENT_DONE_DAYS)}`,
              )
            : done,
        )
          .orderBy(desc(tasks.completedAt))
          .limit(doneLimit),
  ]);
  // position é COLLATE "C": a comparação de string do JS dá a mesma ordem
  const rows = [...open, ...closed].sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  const truncated = closed.length === doneLimit;
  if (rows.length === 0) return { tasks: [], truncated };

  const ids = rows.map((r) => r.id);
  const [projectRows, unitRows, labelRows] = await Promise.all([
    db
      .select({
        taskId: taskProjects.taskId,
        id: projects.id,
        code: projects.code,
        name: projects.name,
        color: projects.color,
      })
      .from(taskProjects)
      .innerJoin(projects, eq(projects.id, taskProjects.projectId))
      .where(inArray(taskProjects.taskId, ids))
      .orderBy(asc(projects.code)),
    db
      .select({ taskId: taskMobileUnits.taskId, code: mobileUnits.code, color: projects.color })
      .from(taskMobileUnits)
      .innerJoin(mobileUnits, eq(mobileUnits.id, taskMobileUnits.mobileUnitId))
      .leftJoin(projects, eq(projects.id, mobileUnits.projectId))
      .where(inArray(taskMobileUnits.taskId, ids))
      .orderBy(asc(mobileUnits.code)),
    db
      .select({ taskId: taskLabels.taskId, name: labels.name, colorToken: labels.colorToken })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.labelId))
      .where(inArray(taskLabels.taskId, ids))
      .orderBy(asc(labels.name)),
  ]);
  const by = <T extends { taskId: string }>(list: T[], id: string) =>
    list.filter((r) => r.taskId === id);
  return {
    tasks: rows.map((r) => ({
      ...r,
      projects: by(projectRows, r.id),
      units: by(unitRows, r.id).map(({ code, color }) => ({ code, color })),
      labels: by(labelRows, r.id),
    })),
    truncated,
  };
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>["tasks"][number];

/**
 * Subtarefas abertas com prazo, para o calendário de Minhas tarefas (Módulo 15). Recebe os ids de
 * uma lista já filtrada e ainda assim aplica o visibleTo(actor).
 */
export async function listChecklistDue(actor: Actor, taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db
    .select({
      id: checklistItems.id,
      text: checklistItems.text,
      dueDate: sql<string>`${checklistItems.dueDate}`,
      dueTime: checklistItems.dueTime,
      number: tasks.number,
    })
    .from(checklistItems)
    .innerJoin(tasks, eq(tasks.id, checklistItems.taskId))
    .where(
      and(
        inArray(checklistItems.taskId, taskIds),
        eq(checklistItems.done, false),
        sql`${checklistItems.dueDate} IS NOT NULL`,
        visibleTo(actor),
      ),
    )
    .orderBy(asc(checklistItems.position));
}

// ── Busca ⌘K (ADR-048) ──────────────────────────────────────────────

/** Palavras viram prefixos (`roteador:*`) para buscar enquanto digita; só letras e dígitos. */
export function prefixQuery(q: string) {
  const words = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map((w) => `${w}:*`).join(" & ");
}

/**
 * Critério da busca: título/descrição, `TI-142` (ou `ti142`, `142`), `#48213` (GLPI) e código de
 * UM. Usado pelo ⌘K e pelo `?q=` das visões (Módulo 18). `undefined` = sem critério.
 */
function searchCriteria(input: string) {
  const q = input.trim().slice(0, 100);
  if (!q) return undefined;
  const bare = q.replace(/^TI-?/i, "");
  const number = /^\d{1,9}$/.test(bare) ? bare : undefined;
  const glpi = /^#(\d{1,7})$/.exec(q)?.[1];
  const unit = q.replace(/^UM-/i, "").replace(/[\\%_]/g, "\\$&");
  const words = prefixQuery(q);
  const tsq = words ? sql`to_tsquery('portuguese', unaccent_immutable(${words}))` : null;
  if (!number && !glpi && !tsq && unit.length < 2) return undefined;
  const where = or(
    number ? eq(tasks.number, Number(number)) : undefined,
    glpi ? eq(tasks.glpiTicket, Number(glpi)) : undefined,
    tsq ? sql`${tasks.search} @@ ${tsq}` : undefined,
    unit.length >= 2
      ? inArray(
          tasks.id,
          db
            .select({ id: taskMobileUnits.taskId })
            .from(taskMobileUnits)
            .innerJoin(mobileUnits, eq(mobileUnits.id, taskMobileUnits.mobileUnitId))
            .where(sql`${mobileUnits.code} ILIKE ${unit + "%"}`),
        )
      : undefined,
  );
  return { tsq, where };
}

/** ⌘K: o critério acima; abertas primeiro, até 20. */
export async function searchTasks(actor: Actor, input: string) {
  const c = searchCriteria(input);
  if (!c) return []; // sem critério, sem resultado
  const { tsq } = c;
  return db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      category: workflowStatuses.category,
      glpiTicket: tasks.glpiTicket,
      visibility: tasks.visibility,
    })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(
      and(
        isNull(tasks.archivedAt),
        visibleTo(actor), // ADR-069: a busca acha as pessoais só de quem busca
        c.where,
      ),
    )
    .orderBy(
      sql`${workflowStatuses.category} = 'done'`,
      tsq ? sql`ts_rank(${tasks.search}, ${tsq}) DESC` : desc(tasks.number),
      desc(tasks.number),
    )
    .limit(20);
}
export type SearchHit = Awaited<ReturnType<typeof searchTasks>>[number];
