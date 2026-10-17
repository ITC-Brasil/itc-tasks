import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Theme } from "@/lib/validation/preferences";
import type { Actor } from "@/server/actor";

type UserActor = Extract<Actor, { kind: "user" }>;

// preferências são da própria pessoa: o alvo é sempre o actor
export async function setTheme(actor: UserActor, theme: Theme) {
  await db.update(user).set({ theme }).where(eq(user.id, actor.userId));
}

export async function setSidebarCollapsed(actor: UserActor, collapsed: boolean) {
  await db.update(user).set({ sidebarCollapsed: collapsed }).where(eq(user.id, actor.userId));
}
