import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { apikey } from "@/db/schema";
import { env } from "@/lib/env";
import type { Actor } from "@/server/actor";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import {
  agentFromKey,
  createAgentKey,
  listAgentActivity,
  listAgentKeys,
  revokeAgentKey,
  revokeAllAgentKeys,
} from "@/server/services/agents";
import { createMember } from "@/server/services/members";

// ADR-074: cada pessoa vê só os próprios tokens; o admin só revoga todos de um membro
const system: Actor = { kind: "system" };
const run = Date.now();
const password = "senha-de-teste-123";
let admin: Extract<Actor, { kind: "user" }>;
let member: Extract<Actor, { kind: "user" }>;
let adminEmail: string;

beforeAll(async () => {
  adminEmail = `tok-admin-${run}@t.test`;
  const a = await createMember(system, {
    name: "Tok Admin",
    email: adminEmail,
    password,
    role: "admin",
  });
  const m = await createMember(system, {
    name: "Tok Membro",
    email: `tok-membro-${run}@t.test`,
    password,
    role: "member",
  });
  admin = { kind: "user", userId: a.id, role: "admin" };
  member = { kind: "user", userId: m.id, role: "member" };
});

const req = (path: string, body?: unknown, cookie?: string) =>
  new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin: env.BETTER_AUTH_URL,
      ...(cookie && { cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it("admin lista só os próprios tokens, pelo service e pela API do Better Auth", async () => {
  const mine = await createAgentKey(admin, { name: "Do admin", access: "read" });
  const theirs = await createAgentKey(member, { name: "Do membro", access: "write" });
  const ids = (await listAgentKeys(admin)).map((k) => k.id);
  expect(ids).toContain(mine.id);
  expect(ids).not.toContain(theirs.id);
  expect((await listAgentKeys(member)).map((k) => k.id)).toEqual([theirs.id]);
  expect(await listAgentActivity(admin)).toEqual(
    expect.not.arrayContaining([expect.objectContaining({ tokenName: "Do membro" })]),
  );

  // ADR-058: as rotas do plugin apiKey continuam fechadas, inclusive a listagem
  const login = await POST(req("/sign-in/email", { email: adminEmail, password }));
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  expect((await GET(req("/api-key/list", undefined, cookie))).status).toBe(404);
  expect((await GET(req(`/api-key/get?id=${theirs.id}`, undefined, cookie))).status).toBe(404);
});

it("ninguém revoga token alheio, nem o admin; criar para outra pessoa é recusado", async () => {
  const theirs = await createAgentKey(member, { name: "Alheio", access: "read" });
  await expect(revokeAgentKey(admin, theirs.id)).rejects.toThrow();
  const other = await createAgentKey(admin, { name: "Outro", access: "read" });
  await expect(revokeAgentKey(member, other.id)).rejects.toThrow();
  await expect(
    createAgentKey(admin, { name: "Para o membro", access: "read", userId: member.userId }),
  ).rejects.toThrow();
});

it("revogar todos: só admin pessoa; corta os ativos do membro e devolve só a contagem", async () => {
  const k = await createAgentKey(member, { name: "Vai cair", access: "read" });
  expect("actor" in (await agentFromKey(k.key))).toBe(true);
  await expect(revokeAllAgentKeys(member, member.userId)).rejects.toThrow();
  await expect(
    revokeAllAgentKeys(
      { kind: "agent", userId: admin.userId, role: "admin", apiKeyId: "x" },
      member.userId,
    ),
  ).rejects.toThrow();
  const { count } = await revokeAllAgentKeys(admin, member.userId);
  expect(count).toBeGreaterThanOrEqual(1);
  expect("status" in (await agentFromKey(k.key))).toBe(true);
  const active = await db
    .select({ id: apikey.id })
    .from(apikey)
    .where(eq(apikey.referenceId, member.userId));
  expect((await listAgentKeys(member)).filter((r) => r.enabled)).toEqual([]);
  expect(active.length).toBeGreaterThanOrEqual(1); // revogar = desativar (ADR-049)
  expect((await revokeAllAgentKeys(admin, member.userId)).count).toBe(0);
});
