"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RecurrenceInput } from "@/lib/validation/recurrences";
import { taskIdSchema } from "@/lib/validation/tasks";
import { ForbiddenError, requireActor } from "@/server/actor";
import type { TaskResult } from "@/server/actions/tasks";
import {
  deleteRecurrence,
  saveRecurrence,
  setRecurrencePaused,
} from "@/server/services/recurrences";
import { TaskError } from "@/server/services/tasks";

// Só valida, chama o service e mapeia erros (ADR-003); o Zod do conteúdo roda no service
async function run(fn: () => Promise<unknown>): Promise<TaskResult<undefined>> {
  try {
    await fn();
    revalidatePath("/recorrencias");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof TaskError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

export async function saveRecurrenceAction(id: string | null, input: RecurrenceInput) {
  const actor = await requireActor();
  return run(() => saveRecurrence(actor, taskIdSchema.nullable().parse(id), input));
}

export async function setRecurrencePausedAction(id: string, paused: boolean) {
  const actor = await requireActor();
  return run(() => setRecurrencePaused(actor, taskIdSchema.parse(id), z.boolean().parse(paused)));
}

export async function deleteRecurrenceAction(id: string) {
  const actor = await requireActor();
  return run(() => deleteRecurrence(actor, taskIdSchema.parse(id)));
}
