import { z } from "zod";
import { sessionActor } from "@/server/actor";
import { MAX_ATTACHMENT_BYTES, addAttachment } from "@/server/services/attachments";
import { TaskError } from "@/server/services/tasks";

const STATUS = { VALIDATION: 400, NOT_FOUND: 404, TOO_LARGE: 413, UNSUPPORTED_TYPE: 415 } as const;

// API.md §5: multipart com taskId e file; o service valida e grava
export async function POST(request: Request) {
  const actor = await sessionActor();
  if (!actor) return Response.json({ error: "Sessão expirada" }, { status: 401 });
  // recusa antes de ler o corpo; a folga cobre o envelope multipart
  if (Number(request.headers.get("content-length")) > MAX_ATTACHMENT_BYTES + 64 * 1024)
    return Response.json({ error: "O arquivo passa de 25 MB" }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new TaskError("VALIDATION", "Envie um arquivo");
    const row = await addAttachment(actor, String(form.get("taskId") ?? ""), file);
    return Response.json(
      { id: row.id, fileName: row.fileName, sizeBytes: row.sizeBytes },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof TaskError && error.code in STATUS)
      return Response.json(
        { error: error.message },
        { status: STATUS[error.code as keyof typeof STATUS] },
      );
    if (error instanceof z.ZodError)
      return Response.json({ error: "Tarefa inválida" }, { status: 400 });
    throw error;
  }
}
