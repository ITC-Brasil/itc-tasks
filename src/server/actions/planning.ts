"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CycleInput, MilestoneInput } from "@/lib/validation/planning";
import { taskIdSchema } from "@/lib/validation/tasks";
import { ForbiddenError, requireActor } from "@/server/actor";
import type { TaskResult } from "@/server/actions/tasks";
import {
  closeCycle,
  createCycle,
  deleteCycle,
  deleteMilestone,
  saveMilestone,
  setMilestoneClosed,
  startCycle,
  updateCycle,
} from "@/server/services/planning";
import { TaskError } from "@/server/services/tasks";

// Só valida, chama o service e mapeia erros (ADR-003); o Zod do conteúdo roda no service
async function run<T>(path: string, fn: () => Promise<T>): Promise<TaskResult<T>> {
  try {
    const data = await fn();
    revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TaskError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

const id = taskIdSchema;

export async function saveCycleAction(cycleId: string | null, input: CycleInput) {
  const actor = await requireActor();
  return run("/ciclos", async () => {
    const parsed = id.nullable().parse(cycleId);
    await (parsed ? updateCycle(actor, parsed, input) : createCycle(actor, input));
  });
}

export async function startCycleAction(cycleId: string) {
  const actor = await requireActor();
  return run("/ciclos", async () => {
    await startCycle(actor, id.parse(cycleId));
  });
}

export async function closeCycleAction(cycleId: string, carryTaskIds: string[]) {
  const actor = await requireActor();
  return run("/ciclos", () => closeCycle(actor, id.parse(cycleId), { carryTaskIds }));
}

export async function saveMilestoneAction(milestoneId: string | null, input: MilestoneInput) {
  const actor = await requireActor();
  return run("/marcos", async () => {
    await saveMilestone(actor, id.nullable().parse(milestoneId), input);
  });
}

export async function setMilestoneClosedAction(milestoneId: string, closed: boolean) {
  const actor = await requireActor();
  return run("/marcos", () =>
    setMilestoneClosed(actor, id.parse(milestoneId), z.boolean().parse(closed)),
  );
}

// ADR-071: só admin; o service recusa o resto
export async function deleteCycleAction(cycleId: string) {
  const actor = await requireActor();
  return run("/ciclos", async () => {
    await deleteCycle(actor, id.parse(cycleId));
  });
}

export async function deleteMilestoneAction(milestoneId: string) {
  const actor = await requireActor();
  return run("/marcos", async () => {
    await deleteMilestone(actor, id.parse(milestoneId));
  });
}
