import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { type CreateMemberInput, createMemberSchema, roleSchema } from "@/lib/validation/members";
import { type Actor, assertAdmin } from "@/server/actor";
import { auth } from "@/server/auth";

export class MemberError extends Error {}

export async function listMembers(actor: Actor) {
  assertAdmin(actor);
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      initials: user.initials,
      role: user.role,
      banned: user.banned,
    })
    .from(user)
    .orderBy(asc(user.name));
}

export async function createMember(actor: Actor, input: CreateMemberInput) {
  assertAdmin(actor);
  const data = createMemberSchema.parse(input);
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, data.email));
  if (existing) throw new MemberError("Já existe um membro com esse e-mail");
  // createUser do plugin admin: hash Argon2id e conta credential pelo próprio Better Auth
  const { user: created } = await auth.api.createUser({ body: data });
  return created;
}

// Regra: ninguém muda o próprio papel nem se desativa, então sempre resta um admin ativo
function assertNotSelf(actor: Actor, userId: string) {
  if ("userId" in actor && actor.userId === userId) {
    throw new MemberError("Você não pode alterar a própria conta aqui");
  }
}

export async function setMemberRole(actor: Actor, userId: string, role: "admin" | "member") {
  assertAdmin(actor);
  assertNotSelf(actor, userId);
  await db
    .update(user)
    .set({ role: roleSchema.parse(role) })
    .where(eq(user.id, userId));
}

/** Desativar = ban do plugin admin (ADR-018: membros nunca são excluídos). Encerra as sessões. */
export async function setMemberActive(actor: Actor, userId: string, active: boolean) {
  assertAdmin(actor);
  assertNotSelf(actor, userId);
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: !active, banReason: active ? null : "Desativado por um admin" })
      .where(eq(user.id, userId));
    if (!active) await tx.delete(session).where(eq(session.userId, userId));
  });
}
