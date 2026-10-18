"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { markReadSchema } from "@/lib/validation/notifications";
import { requireActor } from "@/server/actor";
import { markRead, setChannel, setSchedule } from "@/server/services/notifications";

/** Sem `ids` = marcar todas como lidas. */
export async function markNotificationsReadAction(ids?: string[]) {
  const actor = await requireActor();
  await markRead(actor, markReadSchema.parse(ids));
  revalidatePath("/notificacoes");
}

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await fn();
    revalidatePath("/config/preferencias");
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

export async function setNotificationChannelAction(input: unknown) {
  const actor = await requireActor();
  return run(() => setChannel(actor, input));
}

export async function setNotificationScheduleAction(form: FormData) {
  const actor = await requireActor();
  return run(() =>
    setSchedule(actor, {
      quietHoursStart: form.get("quietHoursStart"),
      quietHoursEnd: form.get("quietHoursEnd"),
      emailDigest: form.get("emailDigest") === "on",
    }),
  );
}
