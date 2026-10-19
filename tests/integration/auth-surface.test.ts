import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apikey } from "@/db/schema";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import { env } from "@/lib/env";
import type { Actor } from "@/server/actor";
import { createMember } from "@/server/services/members";
import { agentFromKey, createAgentKey, revokeAgentKey } from "@/server/services/agents";

// ADR-058: a rota HTTP do Better Auth só abre login, logout e sessão
const run = Date.now();
const password = "senha-de-teste-123";
const email = `surface-${run}@t.test`;
let member: Actor;

const req = (path: string, body?: unknown, cookie?: string) =>
  new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin: env.BETTER_AUTH_URL,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  const m = await createMember(
    { kind: "system" },
    { name: "Surface", email, password, role: "member" },
  );
  member = { kind: "user", userId: m.id, role: "member" };
});

describe("superfície HTTP do Better Auth", () => {
  it("login, sessão e logout continuam abertos", async () => {
    const res = await POST(req("/sign-in/email", { email, password }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const session = await GET(req("/get-session", undefined, cookie));
    expect((await session.json())?.user?.email).toBe(email);
    expect((await POST(req("/sign-out", {}, cookie))).status).toBe(200);
  });

  it("token revogado não volta pelo /api-key/update (A01)", async () => {
    const res = await POST(req("/sign-in/email", { email, password }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const { id, key } = await createAgentKey(member, { name: "t", access: "read" });
    await revokeAgentKey(member, id);
    const update = await POST(req("/api-key/update", { keyId: id, enabled: true }, cookie));
    expect(update.status).toBe(404);
    expect((await POST(req("/api-key/delete", { keyId: id }, cookie))).status).toBe(404);
    const [row] = await db
      .select({ enabled: apikey.enabled })
      .from(apikey)
      .where(eq(apikey.id, id));
    expect(row.enabled).toBe(false);
    expect("status" in (await agentFromKey(key))).toBe(true);
  });

  it("fecha update-user e os endpoints do plugin admin (A15)", async () => {
    for (const path of [
      "/update-user",
      "/admin/remove-user",
      "/admin/set-role",
      "/api-key/create",
      "/sign-up/email",
    ])
      expect((await POST(req(path, {}))).status).toBe(404);
  });
});
