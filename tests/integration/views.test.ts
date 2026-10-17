import { beforeAll, expect, it } from "vitest";
import { parseTaskFilters } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { createMobileUnit, createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  createSavedFilter,
  deleteSavedFilter,
  listSavedFilters,
} from "@/server/services/saved-filters";
import { completeTask, createTask, listTasks } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();
const code = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join("");
let me: Extract<Actor, { kind: "user" }>;
let other: Extract<Actor, { kind: "user" }>;
let a: string, b: string, unitB: string;

const member = async (name: string) => {
  const u = await createMember(system, {
    name,
    email: `${name}-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user", userId: u.id, role: "member" } as const;
};

beforeAll(async () => {
  me = await member("visoes");
  other = await member("outra");
  a = (await createProject(system, { code: code(), name: "Visões A", kind: "client" })).id;
  b = (await createProject(system, { code: code(), name: "Visões B", kind: "client" })).id;
  unitB = (await createMobileUnit(system, { code: `V${run}`, projectId: b })).id;
});

const titles = async (...args: Parameters<typeof listTasks>) =>
  (await listTasks(...args)).map((t) => t.title).sort();

it("filtra por qualquer Projeto/Cliente e UM vinculados, não só o principal (ADR-045)", async () => {
  await createTask(me, { title: `só A ${run}`, projectIds: [a] });
  await createTask(me, {
    title: `A e B ${run}`,
    projectIds: [a, b],
    mobileUnitIds: [unitB],
    priority: "urgent",
    assigneeId: me.userId,
  });
  expect(await titles(me, { projectIds: [b] })).toEqual([`A e B ${run}`]);
  expect(await titles(me, { projectIds: [a] })).toEqual([`A e B ${run}`, `só A ${run}`]);
  expect(await titles(me, { mobileUnitIds: [unitB] })).toEqual([`A e B ${run}`]);
  expect(await titles(me, { projectIds: [a], priorities: ["urgent"] })).toEqual([`A e B ${run}`]);
  expect(await titles(me, { projectIds: [a], assigneeIds: [other.userId] })).toEqual([]);
  const [row] = await listTasks(me, { projectIds: [b] });
  expect(row.projects).toHaveLength(2);
});

it("Minhas tarefas: abertas atribuídas ou criadas pela pessoa", async () => {
  const t = await createTask(other, {
    title: `de outra ${run}`,
    projectIds: [a],
    assigneeId: me.userId,
  });
  const mine = await titles(me, { projectIds: [a] }, { assigneeId: me.userId, openOnly: true });
  expect(mine).toEqual([`A e B ${run}`, `de outra ${run}`]);
  await completeTask(me, t.id);
  expect(await titles(me, { projectIds: [a] }, { assigneeId: me.userId, openOnly: true })).toEqual([
    `A e B ${run}`,
  ]);
  expect(await titles(me, { projectIds: [a] }, { creatorId: other.userId })).toEqual([
    `de outra ${run}`,
  ]);
});

it("lê filtros da URL e ignora parâmetro inválido", () => {
  const f = parseTaskFilters(
    new URLSearchParams(`projeto=${a}&projeto=${b}&prioridade=urgent&etiqueta=x&status=`),
  );
  expect(f.projectIds).toEqual([a, b]);
  expect(f.priorities).toEqual(["urgent"]);
  expect(f.labelIds).toEqual([]);
  expect(f.statusIds).toEqual([]);
});

it("filtro salvo é só do dono", async () => {
  const s = await createSavedFilter(me, {
    name: "Urgentes",
    view: "list",
    filters: { priorities: ["urgent"] },
  });
  expect((await listSavedFilters(me)).map((x) => x.name)).toContain("Urgentes");
  expect(await listSavedFilters(other)).toEqual([]);
  await expect(deleteSavedFilter(other, s.id)).rejects.toThrow("Filtro salvo não encontrado");
  await expect(createSavedFilter(me, { name: " ", view: "list", filters: {} })).rejects.toThrow(
    "Informe o nome",
  );
  await deleteSavedFilter(me, s.id);
  expect(await listSavedFilters(me)).toEqual([]);
});
