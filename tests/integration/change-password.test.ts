import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { session } from "@/db/schema";
import { type Actor, ForbiddenError } from "@/server/actor";
import { auth } from "@/server/auth";
import { MemberError, changeOwnPassword, createMember } from "@/server/services/members";

// M-117: cada pessoa troca a própria senha conferindo a atual
const system: Actor = { kind: "system" };
const old = "senha-de-teste-123";
const email = `troca-${Date.now()}@t.test`;
let me: Extract<Actor, { kind: "user" }>;

const signIn = (password: string) =>
  auth.api.signInEmail({ body: { email, password }, asResponse: true });
const sessionIds = async () =>
  (await db.select({ id: session.id }).from(session).where(eq(session.userId, me.userId))).map(
    (s) => s.id,
  );
const input = (current: string, next: string, confirm = next) => ({ current, next, confirm });

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Troca Senha",
    email,
    password: old,
    role: "member",
  });
  me = { kind: "user", userId: u.id, role: "member" };
});

it("recusa senha atual errada, senha fraca, confirmação diferente e agente", async () => {
  await expect(
    changeOwnPassword(me, input("errada-123456", "nova-senha-forte-1"), "x"),
  ).rejects.toBeInstanceOf(MemberError);
  await expect(changeOwnPassword(me, input(old, "curta"), "x")).rejects.toThrow();
  await expect(
    changeOwnPassword(me, input(old, "nova-senha-forte-1", "outra-coisa-12"), "x"),
  ).rejects.toThrow();
  const agent: Actor = { kind: "agent", userId: me.userId, role: "member", apiKeyId: "k" };
  await expect(
    changeOwnPassword(agent, input(old, "nova-senha-forte-1"), "x"),
  ).rejects.toBeInstanceOf(ForbiddenError);
  expect((await signIn(old)).status).toBe(200);
});

it("troca, derruba as outras sessões, mantém a atual e a nova senha entra", async () => {
  await signIn(old);
  const [keep, ...others] = await sessionIds();
  expect(others.length).toBeGreaterThan(0);
  await changeOwnPassword(me, input(old, "nova-senha-forte-1"), keep);
  expect(await sessionIds()).toEqual([keep]);
  expect((await signIn(old)).status).toBe(401);
  expect((await signIn("nova-senha-forte-1")).status).toBe(200);
});

it("depois de 5 erros em 15 min recusa até a senha certa", async () => {
  const u = await createMember(system, {
    name: "Limite Senha",
    email: `limite-${Date.now()}@t.test`,
    password: old,
    role: "member",
  });
  const who: Actor = { kind: "user", userId: u.id, role: "member" };
  for (let i = 0; i < 5; i++)
    await expect(
      changeOwnPassword(who, input("errada-123456", "nova-senha-forte-1"), "x"),
    ).rejects.toThrow("Senha atual incorreta");
  await expect(changeOwnPassword(who, input(old, "nova-senha-forte-1"), "x")).rejects.toThrow(
    "Muitas tentativas",
  );
});
