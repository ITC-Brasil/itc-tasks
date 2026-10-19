import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { productionEnvProblems } from "./env-checks";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    DATABASE_URL_TEST: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GLPI_BASE_URL: z.url(),
    APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
    UPLOADS_DIR: z.string().default("/data/uploads"),
    // ponytail: opcionais até os módulos que os usam (01 seed, 08 push/e-mail) torná-los obrigatórios
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: z.stringbool().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
  },
  client: {},
  experimental__runtimeEnv: {},
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  emptyStringAsUndefined: true,
});

if (process.env.SKIP_ENV_VALIDATION !== "1" && env.NODE_ENV === "production") {
  const problems = productionEnvProblems(env);
  if (problems.length) throw new Error(`Configuração insegura: ${problems.join("; ")}`);
}

// ADR-065: endereço do MCP mostrado na ajuda e em Agentes e MCP; lido na requisição (o build roda sem env)
export const mcpUrl = () => new URL("/mcp", env.BETTER_AUTH_URL).href;
