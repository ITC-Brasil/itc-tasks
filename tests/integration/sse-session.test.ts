import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { auth } from "@/server/auth";
import { createMember, setMemberActive, stillSignedIn } from "@/server/services/members";

// issue #27: o SSE confere a cada ping se a pessoa ainda tem sessão válida
it("desativar o membro faz o SSE perder a sessão", async () => {
  const system: Actor = { kind: "system" };
  const run = Date.now();
  const password = "senha-de-teste-123";
  const mk = (n: string, role: "admin" | "member") =>
    createMember(system, { name: n, email: `${n}-sse-${run}@t.test`, password, role });
  const a = await mk("adm", "admin");
  const m = await mk("mem", "member");
  expect(await stillSignedIn(m.id)).toBe(false); // nunca entrou
  await auth.api.signInEmail({ body: { email: `mem-sse-${run}@t.test`, password } });
  expect(await stillSignedIn(m.id)).toBe(true);
  await setMemberActive({ kind: "user", userId: a.id, role: "admin" }, m.id, false);
  expect(await stillSignedIn(m.id)).toBe(false);
});
