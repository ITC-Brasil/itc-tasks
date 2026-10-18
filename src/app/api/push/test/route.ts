import { sessionActor } from "@/server/actor";
import { sendTestPush } from "@/server/services/notifications";

// API.md §4: push de teste para as assinaturas da própria pessoa
export async function POST() {
  const actor = await sessionActor();
  if (!actor) return Response.json({ error: "Sessão expirada" }, { status: 401 });
  const sent = await sendTestPush(actor);
  return Response.json({ sent }, { status: 202 });
}
