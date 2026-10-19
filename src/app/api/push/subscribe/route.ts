import { z } from "zod";
import { sessionActor } from "@/server/actor";
import { rejectCrossSite } from "@/server/origin";
import { PushConflictError, subscribePush, unsubscribePush } from "@/server/services/notifications";

// API.md §4: assinatura de Web Push do navegador (ADR-050)
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request, { json: true });
  if (rejected) return rejected;
  const actor = await sessionActor();
  if (!actor) return Response.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    const row = await subscribePush(actor, await request.json());
    return Response.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "Assinatura inválida" }, { status: 400 });
    if (error instanceof PushConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request, { json: true });
  if (rejected) return rejected;
  const actor = await sessionActor();
  if (!actor) return Response.json({ error: "Sessão expirada" }, { status: 401 });
  const body = z
    .object({ endpoint: z.string().max(2000) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Assinatura inválida" }, { status: 400 });
  await unsubscribePush(actor, body.data.endpoint);
  return new Response(null, { status: 204 });
}
