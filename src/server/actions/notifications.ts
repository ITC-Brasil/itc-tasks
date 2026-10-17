"use server";

import { revalidatePath } from "next/cache";
import { markReadSchema } from "@/lib/validation/notifications";
import { requireActor } from "@/server/actor";
import { markRead } from "@/server/services/notifications";

/** Sem `ids` = marcar todas como lidas. */
export async function markNotificationsReadAction(ids?: string[]) {
  const actor = await requireActor();
  await markRead(actor, markReadSchema.parse(ids));
  revalidatePath("/notificacoes");
}
