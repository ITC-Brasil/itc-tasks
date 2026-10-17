import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import { type Actor, ForbiddenError } from "@/server/actor";
import {
  CatalogError,
  createLabel,
  createMobileUnit,
  createProject,
  createStatus,
  listLabels,
  listMobileUnits,
  listProjects,
  listStatuses,
  moveStatus,
  setLabelArchived,
  setMobileUnitArchived,
  setProjectArchived,
  setStatusArchived,
  updateMobileUnit,
} from "@/server/services/catalog";

const admin: Actor = { kind: "system" };
const member: Actor = { kind: "user", userId: "x", role: "member" };
// sigla única por execução: 4 letras a partir do relógio
const code = Array.from(Date.now().toString(26).slice(-4), (c) =>
  String.fromCharCode(65 + (parseInt(c, 26) % 26)),
).join("");
// outra sigla: mesma base, última letra deslocada (nunca igual a `code`)
const variant = (n: number) =>
  code.slice(0, 3) + String.fromCharCode(65 + ((code.charCodeAt(3) - 65 + n) % 26));
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

it("sigla é única sem diferenciar maiúsculas e tem 2 a 12 letras ou números (ADR-044)", async () => {
  const p = await createProject(admin, { code: code.toLowerCase(), name: "Teste", kind: "client" });
  expect(p.code).toBe(code);
  await expect(createProject(admin, { code, name: "Outro", kind: "internal" })).rejects.toThrow(
    new CatalogError(`Já existe um Projeto/Cliente com a sigla ${code}`),
  );
  const long = await createProject(admin, { code: `${code}01x`, name: "Longa", kind: "project" });
  expect(long.code).toBe(`${code}01X`);
  expect(long.kind).toBe("project");
  await expect(createProject(admin, { code: "A-1", name: "Ruim", kind: "client" })).rejects.toThrow(
    "A sigla tem de 2 a 12 letras ou números",
  );
});

it("etiqueta só aceita a paleta própria, nunca cor funcional (ADR-041)", async () => {
  await expect(
    createLabel(admin, { name: `func-${code}`, colorToken: "info" as never }),
  ).rejects.toThrow("Escolha uma cor");
  const l = await createLabel(admin, { name: `pal-${code}`, colorToken: "label-slate" });
  expect(l.colorToken).toBe("label-slate");
  const [{ legacy }] = (
    await db.execute<{ legacy: number }>(
      sql`SELECT count(*)::int AS legacy FROM labels WHERE color_token NOT LIKE 'label-%'`,
    )
  ).rows;
  expect(legacy).toBe(0); // migração 0004 renomeou os tokens antigos
});

it("member não escreve cadastros", async () => {
  await expect(createLabel(member, { name: "x", colorToken: "label-blue" })).rejects.toThrow(
    ForbiddenError,
  );
  await expect(createStatus(member, { name: "x", category: "todo" })).rejects.toThrow(
    ForbiddenError,
  );
});

it("arquivado sai dos seletores e volta ao reativar", async () => {
  const p = await createProject(admin, {
    code: variant(1),
    name: "Arq",
    kind: "client",
  });
  const u = await createMobileUnit(admin, { code: `UM-${code}`, projectId: p.id });
  const l = await createLabel(admin, { name: `etq-${code}`, colorToken: "label-olive" });

  await setProjectArchived(admin, p.id, true);
  await setMobileUnitArchived(admin, u.id, true);
  await setLabelArchived(admin, l.id, true);
  expect(ids(await listProjects(admin))).not.toContain(p.id);
  expect(ids(await listMobileUnits(admin))).not.toContain(u.id);
  expect(ids(await listLabels(admin))).not.toContain(l.id);
  expect(ids(await listProjects(admin, { includeArchived: true }))).toContain(p.id);

  await setLabelArchived(admin, l.id, false);
  expect(ids(await listLabels(admin))).toContain(l.id);
});

it("UM não aceita cliente arquivado novo, mas mantém o atual", async () => {
  const p = await createProject(admin, {
    code: variant(2),
    name: "Cli",
    kind: "client",
  });
  const u = await createMobileUnit(admin, { code: `UM-${code}-2`, projectId: p.id });
  await setProjectArchived(admin, p.id, true);

  await expect(createMobileUnit(admin, { code: `UM-${code}-3`, projectId: p.id })).rejects.toThrow(
    "Projeto/Cliente arquivado",
  );
  const kept = await updateMobileUnit(admin, u.id, {
    code: u.code,
    model: "Sprinter",
    projectId: p.id,
  });
  expect(kept.model).toBe("Sprinter");
});

it("workflow: categoria nunca fica sem status ativo; ordem troca com o vizinho", async () => {
  const a = await createStatus(admin, { name: `Feito A ${code}`, category: "done" });
  const b = await createStatus(admin, { name: `Feito B ${code}`, category: "done" });

  await moveStatus(admin, b.id, -1);
  const order = ids(await listStatuses(admin));
  expect(order.indexOf(b.id)).toBe(order.indexOf(a.id) - 1);

  const done = (await listStatuses(admin)).filter((s) => s.category === "done");
  const [last, ...rest] = done;
  for (const s of rest) await setStatusArchived(admin, s.id, true);
  await expect(setStatusArchived(admin, last.id, true)).rejects.toThrow(
    "Cada categoria precisa de ao menos um status ativo",
  );
  for (const s of rest) await setStatusArchived(admin, s.id, false);
});
