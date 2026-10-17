import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { session, user } from "@/db/schema";
import { type Actor, ForbiddenError } from "@/server/actor";
import { auth } from "@/server/auth";
import {
  MemberError,
  createMember,
  resetMemberPassword,
  setMemberActive,
  setMemberRole,
} from "@/server/services/members";

const system: Actor = { kind: "system" };
const password = "senha-de-teste-123";
const run = Date.now();
let admin: Actor;
let member: Actor;
let memberId: string;
let adminId: string;

const signIn = (email: string, pwd = password) =>
  auth.api.signInEmail({ body: { email, password: pwd }, asResponse: true });

beforeAll(async () => {
  const a = await createMember(system, {
    name: "Admin Teste",
    email: `admin-${run}@t.test`,
    password,
    role: "admin",
  });
  const m = await createMember(system, {
    name: "Membro Teste",
    email: `membro-${run}@t.test`,
    password,
    role: "member",
  });
  admin = { kind: "user", userId: a.id, role: "admin" };
  member = { kind: "user", userId: m.id, role: "member" };
  memberId = m.id;
  adminId = a.id;
});

afterAll(() => pool.end());

describe("login", () => {
  it("entra com a senha certa (hash Argon2id)", async () => {
    expect((await signIn(`membro-${run}@t.test`)).status).toBe(200);
    const [row] = await db
      .select({ initials: user.initials, role: user.role })
      .from(user)
      .where(eq(user.id, memberId));
    expect(row).toEqual({ initials: "MT", role: "member" });
  });

  it("recusa senha errada", async () => {
    expect((await signIn(`membro-${run}@t.test`, "outra-senha-123")).status).toBe(401);
  });

  it("não tem cadastro público", async () => {
    const res = await auth.api.signUpEmail({
      body: { name: "X", email: `x-${run}@t.test`, password },
      asResponse: true,
    });
    expect(res.status).toBe(400);
  });

  it("membro desativado não entra", async () => {
    await setMemberActive(admin, memberId, false);
    expect((await signIn(`membro-${run}@t.test`)).status).toBe(403);
    await setMemberActive(admin, memberId, true);
    expect((await signIn(`membro-${run}@t.test`)).status).toBe(200);
  });
});

describe("permissões", () => {
  it("member não cria, desativa nem troca papel", async () => {
    await expect(
      createMember(member, { name: "Y", email: `y-${run}@t.test`, password, role: "admin" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setMemberActive(member, adminId, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setMemberRole(member, memberId, "admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin não altera a própria conta", async () => {
    await expect(setMemberRole(admin, adminId, "member")).rejects.toBeInstanceOf(MemberError);
    await expect(setMemberActive(admin, adminId, false)).rejects.toBeInstanceOf(MemberError);
  });

  it("e-mail duplicado é recusado", async () => {
    await expect(
      createMember(admin, { name: "Dup", email: `membro-${run}@t.test`, password, role: "member" }),
    ).rejects.toBeInstanceOf(MemberError);
  });

  it("alvo inexistente é recusado", async () => {
    await expect(setMemberRole(admin, "nao-existe", "admin")).rejects.toThrow(
      "Membro não encontrado",
    );
    await expect(setMemberActive(admin, "nao-existe", false)).rejects.toThrow(
      "Membro não encontrado",
    );
    await expect(resetMemberPassword(admin, "nao-existe", "outra-senha-123")).rejects.toThrow(
      "Membro não encontrado",
    );
  });

  it("cadastros simultâneos com o mesmo e-mail: um entra, o outro vira MemberError", async () => {
    const input = {
      name: "Corrida",
      email: `corrida-${run}@t.test`,
      password,
      role: "member" as const,
    };
    const results = await Promise.allSettled([
      createMember(admin, input),
      createMember(admin, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(MemberError);
  });
});

describe("redefinir senha", () => {
  it("member não redefine", async () => {
    await expect(resetMemberPassword(member, adminId, "nova-senha-123")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("admin não redefine a própria pelo painel", async () => {
    await expect(resetMemberPassword(admin, adminId, "nova-senha-123")).rejects.toBeInstanceOf(
      MemberError,
    );
  });

  it("senha nova entra, antiga falha, sessões encerradas", async () => {
    const email = `membro-${run}@t.test`;
    expect((await signIn(email)).status).toBe(200);
    await resetMemberPassword(admin, memberId, "nova-senha-123");
    expect(await db.$count(session, eq(session.userId, memberId))).toBe(0);
    expect((await signIn(email)).status).toBe(401);
    expect((await signIn(email, "nova-senha-123")).status).toBe(200);
  });
});
