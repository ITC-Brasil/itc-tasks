import { headers } from "next/headers";
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

/** Sessão válida → Actor; sem sessão (ou conta desativada) → /login. */
export async function requireActor(): Promise<Extract<Actor, { kind: "user" }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) redirect("/login");
  return {
    kind: "user",
    userId: session.user.id,
    role: session.user.role === "admin" ? "admin" : "member",
  };
}

export function isAdmin(actor: Actor) {
  return actor.kind === "system" || ("role" in actor && actor.role === "admin");
}

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError();
}
