import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { type Actor, ForbiddenError } from "@/server/actor";
import { createMember, setMemberName } from "@/server/services/members";

// M-087: cada pessoa troca o próprio nome; o admin troca o de qualquer um
const system: Actor = { kind: "system" };
const run = Date.now();
type U = Extract<Actor, { kind: "user" }>;
let ana: U, bia: U, admin: U;

const person = async (name: string, role: "admin" | "member"): Promise<U> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-name${run}@t.test`,
    password: "senha-de-teste-123",
    role,
  });
  return { kind: "user", userId: u.id, role };
};
const row = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

beforeAll(async () => {
  ana = await person("Ana", "member");
  bia = await person("Bia", "member");
  admin = await person("Chefe", "admin");
});

it("membro troca o próprio nome e as iniciais são recalculadas", async () => {
  await setMemberName(ana, ana.userId, "  Ana Paula Souza ");
  const r = await row(ana.userId);
  expect(r.name).toBe("Ana Paula Souza");
  expect(r.initials).toBe("AS");
});

it("membro não troca o nome de outro; o admin troca", async () => {
  await expect(setMemberName(ana, bia.userId, "Outra")).rejects.toBeInstanceOf(ForbiddenError);
  expect((await row(bia.userId)).name).toBe("Bia");
  await setMemberName(admin, bia.userId, "Beatriz");
  expect(await row(bia.userId)).toMatchObject({ name: "Beatriz", initials: "BE" });
});

it("agente não troca nome, nem o do próprio dono", async () => {
  const agent: Actor = { kind: "agent", userId: ana.userId, role: "member", apiKeyId: "k" };
  await expect(setMemberName(agent, ana.userId, "Robô")).rejects.toBeInstanceOf(ForbiddenError);
});

it("nome vazio, só espaços ou com mais de 80 caracteres é recusado", async () => {
  for (const bad of ["", "   ", "x".repeat(81)])
    await expect(setMemberName(ana, ana.userId, bad)).rejects.toThrow();
  expect((await row(ana.userId)).name).toBe("Ana Paula Souza");
});
