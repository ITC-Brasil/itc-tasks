import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// checagem otimista (só o cookie); a sessão real é validada em requireActor()
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // tudo menos login, rotas de API (auth, health, mcp têm auth própria) e estáticos
  matcher: ["/((?!login|api|mcp|_next|brand|icons|splash|favicon|manifest).*)"],
};
