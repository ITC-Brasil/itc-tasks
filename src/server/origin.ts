import { env } from "@/lib/env";

// ADR-003 (borda HTTP): as rotas de API com cookie recusam POST/DELETE de outra origem.
// SameSite=Lax não barra subdomínios irmãos (*.itcbr.xyz), e text/plain não tem preflight.
const allowed = new Set([new URL(env.BETTER_AUTH_URL).origin, "https://tasks.itcbr.xyz"]);

/** Resposta de recusa, ou `null` se a requisição vem do próprio app. */
export function rejectCrossSite(request: Request, opts: { json?: boolean } = {}) {
  if (!allowed.has(request.headers.get("origin") ?? ""))
    return Response.json({ error: "Origem não permitida" }, { status: 403 });
  if (opts.json && !request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Use application/json" }, { status: 415 });
  return null;
}
