import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { apikey, comments, user } from "@/db/schema";
import { commentBodySchema, taskIdSchema } from "@/lib/validation/tasks";
import { type Actor, ForbiddenError } from "@/server/actor";
import { TaskError, docText, lockTask, record } from "./tasks";

// ADR-048: comentário com @menção; o autor edita o próprio, sem exclusão

/** IDs dos nós `mention` do documento Tiptap. */
export function mentionIds(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as { type?: unknown; attrs?: { id?: unknown }; content?: unknown };
  const own = n.type === "mention" && typeof n.attrs?.id === "string" ? [n.attrs.id] : [];
  const children = Array.isArray(n.content) ? n.content.flatMap(mentionIds) : [];
  return [...new Set([...own, ...children])];
}

function author(actor: Actor) {
  if (actor.kind !== "user" && actor.kind !== "agent")
    throw new TaskError("VALIDATION", "Só pessoas e agentes comentam");
  return actor.userId;
}

async function parse(input: unknown) {
  const bodyJson = commentBodySchema.parse(input);
  const bodyText = docText(bodyJson);
  if (!bodyText) throw new TaskError("VALIDATION", "Escreva o comentário");
  if (bodyText.length > 10_000) throw new TaskError("VALIDATION", "Comentário muito longo");
  const ids = mentionIds(bodyJson);
  // só pessoas ativas contam como mencionadas
  const mentions = ids.length
    ? (
        await db
          .select({ id: user.id })
          .from(user)
          .where(and(inArray(user.id, ids), or(isNull(user.banned), eq(user.banned, false))))
      ).map((r) => r.id)
    : [];
  return { bodyJson, bodyText, mentions };
}

export async function addComment(actor: Actor, taskId: string, body: unknown) {
  const id = taskIdSchema.parse(taskId);
  const authorId = author(actor);
  const data = await parse(body);
  return db.transaction(async (tx) => {
    await lockTask(tx, id);
    const [row] = await tx
      .insert(comments)
      .values({
        taskId: id,
        authorId,
        actorKind: actor.kind === "agent" ? "agent" : "user",
        apiKeyId: actor.kind === "agent" ? actor.apiKeyId : null,
        ...data,
      })
      .returning();
    await record(tx, actor, id, [{ type: "commented", payload: { commentId: row.id } }]);
    return row;
  });
}

export async function editComment(actor: Actor, commentId: string, body: unknown) {
  const id = taskIdSchema.parse(commentId);
  const authorId = author(actor);
  const data = await parse(body);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(comments).where(eq(comments.id, id)).for("update");
    if (!current) throw new TaskError("NOT_FOUND", "Comentário não encontrado");
    if (current.authorId !== authorId) throw new ForbiddenError();
    const [row] = await tx
      .update(comments)
      .set({ ...data, editedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    await record(tx, actor, current.taskId, [
      { type: "comment_edited", payload: { commentId: id } },
    ]);
    return row;
  });
}

/** Comentários da tarefa, mais antigos primeiro, com autor e token (agente). */
export async function listComments(taskId: string) {
  return db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      authorName: user.name,
      authorInitials: user.initials,
      actorKind: comments.actorKind,
      tokenName: apikey.name,
      bodyJson: comments.bodyJson,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .leftJoin(apikey, eq(apikey.id, comments.apiKeyId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt));
}
