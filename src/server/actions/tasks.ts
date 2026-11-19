"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type CreateTaskInput,
  type UpdateTaskInput,
  linkSchema,
  taskIdSchema,
} from "@/lib/validation/tasks";
import { ForbiddenError, requireActor } from "@/server/actor";
import {
  listInvolved,
  listLabels,
  listMobileUnits,
  listProjects,
  listStatuses,
} from "@/server/services/catalog";
import {
  TaskError,
  addChecklistItem,
  addLink,
  bulkUpdateTasks,
  createTask,
  deleteTasks,
  listAssignees,
  listTaskTemplates,
  moveTask,
  removeChecklistItem,
  removeLink,
  lastStatusEventId,
  searchTasks,
  undoStatusChange,
  updateChecklistItem,
  updateTask,
} from "@/server/services/tasks";
import { addComment, editComment } from "@/server/services/comments";
import { listCycles, listMilestones } from "@/server/services/planning";
import { createSavedFilter, deleteSavedFilter } from "@/server/services/saved-filters";

export type TaskResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

// Só valida, chama o service e mapeia erros (ADR-003); o Zod do conteúdo roda no service
async function run<T>(fn: () => Promise<T>, path?: string): Promise<TaskResult<T>> {
  try {
    const data = await fn();
    if (path) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TaskError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

const detail = (n: number) => `/tarefas/${n}`;

/** Opções dos seletores da criação rápida e do detalhe: só cadastros ativos. */
export async function getTaskFormOptionsAction() {
  const actor = await requireActor();
  const [projects, units, statuses, labels, people, tpls, cycles, milestones, involved] =
    await Promise.all([
      listProjects(actor),
      listMobileUnits(actor),
      listStatuses(actor),
      listLabels(actor),
      listAssignees(),
      listTaskTemplates(),
      listCycles(),
      listMilestones(),
      listInvolved(actor),
    ]);
  return {
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
    })),
    units: units.map((u) => ({ id: u.id, code: u.code, projectId: u.projectId })),
    statuses: statuses.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    labels: labels.map((l) => ({ id: l.id, name: l.name, colorToken: l.colorToken })),
    people,
    involved: involved.map((p) => ({ id: p.id, name: p.name })), // ADR-073
    templates: tpls,
    // ADR-053: só ciclos não encerrados e marcos abertos são escolhidos
    cycles: cycles
      .filter((c) => c.state !== "closed")
      .map((c) => ({ id: c.id, number: c.number, state: c.state })),
    milestones: milestones
      .filter((m) => !m.closedAt)
      .map((m) => ({ id: m.id, name: m.name, projectId: m.projectId })),
    actorId: "userId" in actor ? actor.userId : null,
  };
}
export type TaskFormOptions = Awaited<ReturnType<typeof getTaskFormOptionsAction>>;

export async function createTaskAction(input: CreateTaskInput) {
  const actor = await requireActor();
  return run(async () => {
    const t = await createTask(actor, input);
    return { number: t.number };
  });
}

export async function updateTaskAction(taskId: string, number: number, input: UpdateTaskInput) {
  const actor = await requireActor();
  const id = taskIdSchema.parse(taskId);
  // ADR-082: mudança de status devolve o evento, para o Desfazer do toast
  return run(
    () =>
      updateTask(actor, id, input).then(() =>
        input.statusId ? lastStatusEventId(actor, id) : null,
      ),
    detail(number),
  );
}

export async function addChecklistItemAction(taskId: string, number: number, text: string) {
  const actor = await requireActor();
  return run(
    () => addChecklistItem(actor, taskIdSchema.parse(taskId), text).then(() => undefined),
    detail(number),
  );
}

export async function updateChecklistItemAction(
  itemId: string,
  number: number,
  input: Parameters<typeof updateChecklistItem>[2],
) {
  const actor = await requireActor();
  return run(
    () => updateChecklistItem(actor, taskIdSchema.parse(itemId), input).then(() => undefined),
    detail(number),
  );
}

export async function removeChecklistItemAction(itemId: string, number: number) {
  const actor = await requireActor();
  return run(() => removeChecklistItem(actor, taskIdSchema.parse(itemId)), detail(number));
}

export async function setLinkAction(
  taskId: string,
  number: number,
  input: z.input<typeof linkSchema>,
  linked: boolean,
) {
  const actor = await requireActor();
  return run(() => {
    const id = taskIdSchema.parse(taskId); // id inválido vira { ok: false }, não exceção
    return linked ? addLink(actor, id, input) : removeLink(actor, id, input);
  }, detail(number));
}

export async function moveTaskAction(taskId: string, input: Parameters<typeof moveTask>[2]) {
  const actor = await requireActor();
  return run(async () => {
    const id = taskIdSchema.parse(taskId);
    await moveTask(actor, id, input);
    return lastStatusEventId(actor, id); // ADR-082
  });
}

/** ADR-082: Desfazer do toast; o service confere autor e se a tarefa mudou desde então. */
export async function undoStatusAction(taskId: string, eventId: string) {
  const actor = await requireActor();
  return run(() =>
    undoStatusChange(actor, taskIdSchema.parse(taskId), taskIdSchema.parse(eventId)).then(
      () => undefined,
    ),
  );
}

export async function bulkUpdateTasksAction(input: { taskIds: string[]; patch: UpdateTaskInput }) {
  const actor = await requireActor();
  return run(() => bulkUpdateTasks(actor, input).then((t) => t.length));
}

/** ADR-063: exclusão definitiva (detalhe e Lista); o service confere quem pode. */
export async function deleteTasksAction(input: { taskIds: string[] }) {
  const actor = await requireActor();
  return run(() => deleteTasks(actor, input), "/tarefas/lista");
}

export async function createSavedFilterAction(input: unknown) {
  const actor = await requireActor();
  return run(() => createSavedFilter(actor, input).then((f) => f.id));
}

export async function deleteSavedFilterAction(id: string) {
  const actor = await requireActor();
  return run(() => deleteSavedFilter(actor, taskIdSchema.parse(id)));
}

export async function addCommentAction(taskId: string, number: number, body: unknown) {
  const actor = await requireActor();
  return run(() => addComment(actor, taskId, body).then(() => undefined), detail(number));
}

export async function editCommentAction(commentId: string, number: number, body: unknown) {
  const actor = await requireActor();
  return run(() => editComment(actor, commentId, body).then(() => undefined), detail(number));
}

export async function searchTasksAction(q: string) {
  const actor = await requireActor();
  return searchTasks(actor, String(q));
}
