import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { createMember } from "@/server/services/members";
import { setSidebarCollapsed, setTheme } from "@/server/services/preferences";

it("tema e sidebar gravam só no próprio usuário", async () => {
  const run = Date.now();
  const make = (n: string) =>
    createMember(
      { kind: "system" },
      {
        name: `Pref ${n}`,
        email: `pref-${n}-${run}@t.test`,
        password: "senha-de-teste-123",
        role: "member",
      },
    );
  const [a, b] = await Promise.all([make("a"), make("b")]);
  const actor = { kind: "user" as const, userId: a.id, role: "member" as const };

  await setTheme(actor, "dark");
  await setSidebarCollapsed(actor, true);

  const prefs = (id: string) =>
    db
      .select({ theme: user.theme, collapsed: user.sidebarCollapsed })
      .from(user)
      .where(eq(user.id, id))
      .then((r) => r[0]);
  expect(await prefs(a.id)).toEqual({ theme: "dark", collapsed: true });
  expect(await prefs(b.id)).toEqual({ theme: "light", collapsed: false });
});
