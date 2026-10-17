import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export type Role = "admin" | "member";

// ADR-003: toda escrita recebe um Actor; agent/automation/system chegam nos Módulos 07 e 08
export type Actor =
  | { kind: "user"; userId: string; role: Role }
  | { kind: "agent"; userId: string; role: Role; apiKeyId: string }
  | { kind: "automation"; automationId: string }
  | { kind: "system" };

export class ForbiddenError extends Error {
  constructor() {
    super("Você não tem acesso a esta área");
  }
}

/** Sessão válida → Actor + dados do perfil; sem sessão (ou conta desativada) → /login. */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) redirect("/login");
  const u = session.user;
  const actor: Extract<Actor, { kind: "user" }> = {
    kind: "user",
    userId: u.id,
    role: u.role === "admin" ? "admin" : "member",
  };
  return {
    actor,
    profile: {
      name: u.name,
      initials: u.initials ?? "",
      theme: u.theme === "dark" ? ("dark" as const) : ("light" as const),
      sidebarCollapsed: u.sidebarCollapsed === true,
    },
  };
});

export async function requireActor() {
  return (await requireUser()).actor;
}

export function isAdmin(actor: Actor) {
  return actor.kind === "system" || ("role" in actor && actor.role === "admin");
}

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError();
}
