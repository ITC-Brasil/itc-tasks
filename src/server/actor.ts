import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import type { Actor } from "./permissions";

export * from "./permissions";

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

/** Rotas de API: sessão válida → Actor; senão null (a rota responde 401). */
export async function sessionActor(): Promise<Extract<Actor, { kind: "user" }> | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  const u = session.user;
  return { kind: "user", userId: u.id, role: u.role === "admin" ? "admin" : "member" };
}
