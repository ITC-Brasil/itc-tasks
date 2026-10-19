import { sessionActor } from "@/server/actor";
import { sendTestPush } from "@/server/services/notifications";

// API.md §4: push de teste para as assinaturas da própria pessoa
export async function POST() {
  const actor = await sessionActor();
  if (!actor) return Response.json({ error: "Sessão expirada" }, { status: 401 });
  const sent = await sendTestPush(actor);
  if (sent === null)
    return Response.json(
      { error: "Limite de 5 testes por minuto" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  return Response.json({ sent }, { status: 202 });
}
