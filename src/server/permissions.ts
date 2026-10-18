// Partes puras do Actor: services e worker importam daqui, sem Better Auth nem next/headers

export type Role = "admin" | "member";

// ADR-003: toda escrita recebe um Actor; `depth` da automação = nível na cadeia (ADR-052)
export type Actor =
  | { kind: "user"; userId: string; role: Role }
  | { kind: "agent"; userId: string; role: Role; apiKeyId: string }
  | { kind: "automation"; automationId: string; depth: number }
  | { kind: "system" };

export class ForbiddenError extends Error {
  constructor() {
    super("Você não tem acesso a esta área");
  }
}

export function isAdmin(actor: Actor) {
  return actor.kind === "system" || ("role" in actor && actor.role === "admin");
}

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError();
}
