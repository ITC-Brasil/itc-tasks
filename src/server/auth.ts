import { apiKey } from "@better-auth/api-key";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { initialsOf } from "@/lib/initials";

// ADR-008: Argon2id com o mínimo da OWASP
const argon2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// preferências: só o app grava (input: false), nunca o corpo de sign-up/update-user
const pref = <T>(type: "string" | "boolean", defaultValue: T) =>
  ({ type, defaultValue, required: false, input: false }) as const;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // sem o host de produção o túnel devolve UntrustedHost (lição do NoteScan)
  trustedOrigins: [env.BETTER_AUTH_URL, "https://tasks.itcbr.xyz"],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    password: {
      hash: (password) => hash(password, argon2),
      verify: ({ hash: digest, password }) => verify(digest, password),
    },
  },
  user: {
    additionalFields: {
      initials: { type: "string", required: false, input: false },
      theme: pref("string", "light"),
      sidebarCollapsed: pref("boolean", false),
      quietHoursStart: pref("string", "08:00"),
      quietHoursEnd: pref("string", "18:00"),
      emailDigest: pref("boolean", true),
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: { ...user, initials: initialsOf(user.name) } }),
      },
    },
  },
  plugins: [
    admin({ defaultRole: "member", adminRoles: ["admin"] }),
    // ADR-009: tokens MCP, 60 req/min por token
    apiKey({
      defaultPrefix: "itct_",
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 60 },
    }),
    nextCookies(),
  ],
});
