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
import { listLabels, listMobileUnits, listProjects, listStatuses } from "@/server/services/catalog";
import {
  TaskError,
  addChecklistItem,
  addLink,
  createTask,
  listAssignees,
  listTaskTemplates,
  removeChecklistItem,
  removeLink,
  updateChecklistItem,
  updateTask,
} from "@/server/services/tasks";

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
  const [projects, units, statuses, labels, people, tpls] = await Promise.all([
    listProjects(actor),
    listMobileUnits(actor),
    listStatuses(actor),
    listLabels(actor),
    listAssignees(),
    listTaskTemplates(),
  ]);
  return {
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      defaultAssigneeId: p.defaultAssigneeId,
    })),
    units: units.map((u) => ({ id: u.id, code: u.code, projectId: u.projectId })),
    statuses: statuses.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    labels: labels.map((l) => ({ id: l.id, name: l.name, colorToken: l.colorToken })),
    people,
    templates: tpls,
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
  return run(
    () => updateTask(actor, taskIdSchema.parse(taskId), input).then(() => undefined),
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
  input: { text?: string; done?: boolean; assigneeId?: string | null },
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
  const id = taskIdSchema.parse(taskId);
  return run(
    () => (linked ? addLink(actor, id, input) : removeLink(actor, id, input)),
    detail(number),
  );
}
