import { and, asc, eq, gt, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { account, session, taskRecurrences, user } from "@/db/schema";
import {
  type ChangePasswordInput,
  type CreateMemberInput,
  changePasswordSchema,
  createMemberSchema,
  displayNameSchema,
  passwordSchema,
  roleSchema,
} from "@/lib/validation/members";
import { initialsOf } from "@/lib/initials";
import { type Actor, ForbiddenError, assertAdmin, isAdmin } from "@/server/permissions";
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

/** M-087: cada pessoa troca o próprio nome; o admin troca o de qualquer um. Agente não troca. */
export async function setMemberName(actor: Actor, userId: string, name: string) {
  const self = actor.kind === "user" && actor.userId === userId;
  if (actor.kind === "agent" || !(self || isAdmin(actor))) throw new ForbiddenError();
  const value = displayNameSchema.parse(name);
  const rows = await db
    .update(user)
    .set({ name: value, initials: initialsOf(value), updatedAt: new Date() })
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
    if (!active) {
      await tx.delete(session).where(eq(session.userId, userId));
      // A1 (M-158): as recorrências da pessoa param de criar tarefas; o admin retoma as da equipe
      const paused = await tx
        .update(taskRecurrences)
        .set({ pausedAt: new Date() })
        .where(and(eq(taskRecurrences.ownerId, userId), isNull(taskRecurrences.pausedAt)))
        .returning({ id: taskRecurrences.id });
      if (paused.length)
        console.info(
          `[members] recorrências pausadas userId=${userId} count=${paused.length} by=${actor.kind === "user" ? actor.userId : actor.kind}`,
        );
    }
  });
}

/**
 * Conexões longas (SSE) conferem a cada ping: desativar e redefinir a senha apagam as sessões
 * da pessoa (issue #27).
 */
export async function stillSignedIn(userId: string) {
  const [row] = await db
    .select({ id: session.id })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(
      and(
        eq(session.userId, userId),
        gt(session.expiresAt, new Date()),
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    .limit(1);
  return Boolean(row);
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

// M-119: 5 erros de senha atual por pessoa em 15 min.
// ponytail: em memória do processo (o app roda num container só); reinício zera a contagem.
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const failures = new Map<string, number[]>();
function recentFailures(userId: string, now = Date.now()) {
  const list = (failures.get(userId) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failures.set(userId, list);
  return list;
}

/**
 * M-117 / ADR-062: cada pessoa troca a própria senha conferindo a atual. Agente não troca.
 * Encerra as outras sessões e mantém `keepSessionId` (a sessão de onde veio o pedido).
 */
export async function changeOwnPassword(
  actor: Actor,
  input: ChangePasswordInput,
  keepSessionId: string,
) {
  if (actor.kind !== "user") throw new ForbiddenError();
  const data = changePasswordSchema.parse(input);
  if (recentFailures(actor.userId).length >= FAIL_LIMIT)
    throw new MemberError("Muitas tentativas. Tente de novo em 15 minutos");
  const where = and(eq(account.userId, actor.userId), eq(account.providerId, "credential"));
  const [row] = await db.select({ password: account.password }).from(account).where(where);
  const ctx = await auth.$context;
  if (
    !row?.password ||
    !(await ctx.password.verify({ hash: row.password, password: data.current }))
  ) {
    recentFailures(actor.userId).push(Date.now());
    throw new MemberError("Senha atual incorreta");
  }
  failures.delete(actor.userId);
  const hashed = await ctx.password.hash(data.next);
  await db.transaction(async (tx) => {
    await tx.update(account).set({ password: hashed, updatedAt: new Date() }).where(where);
    await tx
      .delete(session)
      .where(and(eq(session.userId, actor.userId), ne(session.id, keepSessionId)));
  });
  // ADR-062: rastro no log do servidor (sem a senha); task_events é só de tarefa
  console.info(`[auth] senha trocada userId=${actor.userId} actor=${actor.kind}`);
}
