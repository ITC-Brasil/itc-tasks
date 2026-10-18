"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TemplateInput } from "@/lib/validation/templates";
import { taskIdSchema } from "@/lib/validation/tasks";
import { ForbiddenError, requireActor } from "@/server/actor";
import type { TaskResult } from "@/server/actions/tasks";
import { TaskError } from "@/server/services/tasks";
import {
  applyProjectTemplate,
  saveTemplate,
  setTemplateArchived,
} from "@/server/services/templates";

// Só valida, chama o service e mapeia erros (ADR-003); o Zod do conteúdo roda no service
async function run<T>(fn: () => Promise<T>): Promise<TaskResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/templates");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TaskError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

export async function saveTemplateAction(id: string | null, input: TemplateInput) {
  const actor = await requireActor();
  return run(async () => {
    await saveTemplate(actor, taskIdSchema.nullable().parse(id), input);
  });
}

export async function setTemplateArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run(() => setTemplateArchived(actor, taskIdSchema.parse(id), z.boolean().parse(archived)));
}

export async function applyProjectTemplateAction(id: string, input: unknown) {
  const actor = await requireActor();
  return run(() => applyProjectTemplate(actor, taskIdSchema.parse(id), input));
}
