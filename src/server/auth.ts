import { apiKey } from "@better-auth/api-key";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

// ADR-008: Argon2id com o mínimo da OWASP
const argon2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

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
  plugins: [
    admin(),
    // ADR-009: tokens MCP, 60 req/min por token
    apiKey({
      defaultPrefix: "itct_",
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 60 },
    }),
    nextCookies(),
  ],
});
