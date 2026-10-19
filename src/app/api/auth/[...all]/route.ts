import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// ADR-058: só o que a UI chama pelo cliente; o resto passa pelos services (auth.api.*).
// Endpoint novo de plugin nasce fechado: abrir aqui exige ADR.
const ALLOWED = new Set(["/sign-in/email", "/sign-out", "/get-session"]);
const handler = toNextJsHandler(auth);
const guard = (fn: (request: Request) => Promise<Response>) => (request: Request) =>
  ALLOWED.has(new URL(request.url).pathname.replace(/^\/api\/auth/, ""))
    ? fn(request)
    : new Response("Not Found", { status: 404 });

export const GET = guard(handler.GET);
export const POST = guard(handler.POST);
