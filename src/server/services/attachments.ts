/* eslint-disable security/detect-non-literal-fs-filename -- caminho = UPLOADS_DIR + uuid gerado aqui */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, user } from "@/db/schema";
import { env } from "@/lib/env";
import { taskIdSchema } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { TaskError, lockTask, record } from "./tasks";

// ADR-025/048: arquivo em UPLOADS_DIR/<uuid>, metadados em `attachments`, até 25 MB
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// o tipo vem da extensão, não do navegador; o download sai com nosniff e como anexo
const TYPES = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
  ["log", "text/plain"],
  ["csv", "text/csv"],
  ["json", "application/json"],
  ["xml", "application/xml"],
  ["zip", "application/zip"],
  ["7z", "application/x-7z-compressed"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["odt", "application/vnd.oasis.opendocument.text"],
  ["ods", "application/vnd.oasis.opendocument.spreadsheet"],
]);

/** Nome seguro para exibir e baixar: sem caminho nem caracteres de controle. */
export function cleanFileName(name: string) {
  const base = path.basename(name.replaceAll("\\", "/"));
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return clean.slice(-200) || "arquivo";
}

export function mimeFor(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return fileName.includes(".") ? TYPES.get(ext) : undefined;
}

const storagePath = (key: string) => path.resolve(env.UPLOADS_DIR, key);

export async function addAttachment(actor: Actor, taskId: string, file: File) {
  const id = taskIdSchema.parse(taskId);
  if (actor.kind !== "user" && actor.kind !== "agent")
    throw new TaskError("VALIDATION", "Só pessoas e agentes anexam arquivos");
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new TaskError("TOO_LARGE", "O arquivo passa de 25 MB");
  if (file.size === 0) throw new TaskError("VALIDATION", "O arquivo está vazio");
  const fileName = cleanFileName(file.name);
  const mimeType = mimeFor(fileName);
  if (!mimeType) throw new TaskError("UNSUPPORTED_TYPE", "Tipo de arquivo não permitido");

  const storageKey = crypto.randomUUID();
  await mkdir(env.UPLOADS_DIR, { recursive: true });
  await writeFile(storagePath(storageKey), Buffer.from(await file.arrayBuffer()));
  try {
    return await db.transaction(async (tx) => {
      await lockTask(tx, id);
      const [row] = await tx
        .insert(attachments)
        .values({
          taskId: id,
          uploaderId: actor.userId,
          fileName,
          mimeType,
          sizeBytes: file.size,
          storageKey,
        })
        .returning();
      await record(tx, actor, id, [
        { type: "attachment_added", payload: { attachmentId: row.id, fileName } },
      ]);
      return row;
    });
  } catch (error) {
    await unlink(storagePath(storageKey)).catch(() => {}); // sem linha, sem arquivo órfão
    throw error;
  }
}

/** Metadados e caminho no disco; null se não existir. */
export async function getAttachment(attachmentId: string) {
  const id = taskIdSchema.safeParse(attachmentId);
  if (!id.success) return null;
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id.data));
  return row ? { ...row, path: storagePath(row.storageKey) } : null;
}

export async function listAttachments(taskId: string) {
  return db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      sizeBytes: attachments.sizeBytes,
      uploaderName: user.name,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .innerJoin(user, eq(user.id, attachments.uploaderId))
    .where(eq(attachments.taskId, taskId))
    .orderBy(asc(attachments.createdAt));
}
