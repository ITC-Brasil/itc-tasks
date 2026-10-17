import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { sessionActor } from "@/server/actor";
import { getAttachment } from "@/server/services/attachments";

export async function GET(_request: Request, { params }: RouteContext<"/api/attachments/[id]">) {
  if (!(await sessionActor())) return new Response(null, { status: 401 });
  const row = await getAttachment((await params).id);
  if (!row) return new Response(null, { status: 404 });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- UPLOADS_DIR + uuid do banco
  const stream = createReadStream(row.path);
  const body = await new Promise<ReadableStream | null>((resolve) => {
    stream.once("open", () => resolve(Readable.toWeb(stream) as ReadableStream));
    stream.once("error", () => resolve(null)); // arquivo sumiu do volume
  });
  if (!body) return new Response(null, { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(row.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
