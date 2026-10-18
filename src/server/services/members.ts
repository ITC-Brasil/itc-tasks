import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user } from "@/db/schema";
import {
  type CreateMemberInput,
  createMemberSchema,
  passwordSchema,
  roleSchema,
} from "@/lib/validation/members";
import { type Actor, assertAdmin } from "@/server/permissions";
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
  const duplicate = new MemberError("Já existe um membro com esse e-mail");
  if (await emailTaken(data.email)) throw duplicate;
  try {
    // createUser do plugin admin: hash Argon2id e conta credential pelo próprio Better Auth
    const { user: created } = await auth.api.createUser({ body: data });
    return created;
  } catch (error) {
    // corrida: outro cadastro com o mesmo e-mail passou pelo select ao mesmo tempo
    if (await emailTaken(data.email)) throw duplicate;
    throw error;
  }
}

async function emailTaken(email: string) {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return !!row;
}

function assertFound(rows: unknown[]) {
  if (rows.length === 0) throw new MemberError("Membro não encontrado");
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
  const rows = await db
    .update(user)
    .set({ role: roleSchema.parse(role) })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  assertFound(rows);
}

/** Desativar = ban do plugin admin (ADR-018: membros nunca são excluídos). Encerra as sessões. */
export async function setMemberActive(actor: Actor, userId: string, active: boolean) {
  assertAdmin(actor);
  assertNotSelf(actor, userId);
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(user)
      .set({ banned: !active, banReason: active ? null : "Desativado por um admin" })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    assertFound(rows);
    if (!active) await tx.delete(session).where(eq(session.userId, userId));
  });
}

/** Único caminho para quem esqueceu a senha (sem cadastro público nem e-mail de recuperação). */
export async function resetMemberPassword(actor: Actor, userId: string, password: string) {
  assertAdmin(actor);
  assertNotSelf(actor, userId);
  // hash pelo Better Auth (Argon2id do auth.ts); set-user-password do plugin exige sessão HTTP
  const hashed = await (await auth.$context).password.hash(passwordSchema.parse(password));
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(account)
      .set({ password: hashed })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    assertFound(rows);
    await tx.delete(session).where(eq(session.userId, userId));
  });
}
