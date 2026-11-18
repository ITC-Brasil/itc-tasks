"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, requireActor } from "@/server/actor";
import { createAgentKey, revokeAgentKey } from "@/server/services/agents";
import { TaskError } from "@/server/services/tasks";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/config/agentes");
    return { ok: true, ...data };
  } catch (error) {
    if (error instanceof TaskError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

/** O segredo volta só nesta resposta (ADR-049). */
export async function createApiKeyAction(form: FormData) {
  const actor = await requireActor();
  return run(async () => {
    const { key } = await createAgentKey(actor, {
      name: form.get("name"),
      access: form.get("access"),
    });
    return { key };
  });
}

export async function revokeApiKeyAction(keyId: string) {
  const actor = await requireActor();
  return run(async () => {
    await revokeAgentKey(actor, z.string().min(1).parse(keyId));
    return {};
  });
}
