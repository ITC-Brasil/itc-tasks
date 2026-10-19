"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createMemberSchema,
  displayNameSchema,
  memberIdSchema,
  passwordSchema,
  roleSchema,
} from "@/lib/validation/members";
import { ForbiddenError, requireActor } from "@/server/actor";
import {
  MemberError,
  createMember,
  resetMemberPassword,
  setMemberActive,
  setMemberName,
  setMemberRole,
} from "@/server/services/members";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    // o nome aparece no shell (avatar) e em toda tela: revalida o layout inteiro
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof MemberError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

export async function createMemberAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() => createMember(actor, createMemberSchema.parse(Object.fromEntries(form))));
}

export async function setMemberRoleAction(userId: string, role: string): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() => setMemberRole(actor, memberIdSchema.parse(userId), roleSchema.parse(role)));
}

export async function setMemberActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() => setMemberActive(actor, memberIdSchema.parse(userId), z.boolean().parse(active)));
}

export async function resetMemberPasswordAction(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() =>
    resetMemberPassword(actor, memberIdSchema.parse(userId), passwordSchema.parse(password)),
  );
}

export async function setMemberNameAction(userId: string, name: string): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() =>
    setMemberName(actor, memberIdSchema.parse(userId), displayNameSchema.parse(name)),
  );
}

/** Minhas preferências: o alvo é sempre quem está logado. */
export async function setMyNameAction(name: string): Promise<ActionResult> {
  const actor = await requireActor();
  return run(() => setMemberName(actor, actor.userId, displayNameSchema.parse(name)));
}
