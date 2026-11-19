import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { parseTaskFilters } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { createMobileUnit, createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  createSavedFilter,
  deleteSavedFilter,
  listSavedFilters,
} from "@/server/services/saved-filters";
import {
  addChecklistItem,
  completeTask,
  createTask,
  listTasks,
  updateChecklistItem,
} from "@/server/services/tasks";

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
  (await listTasks(...args)).tasks.map((t) => t.title).sort();

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
  const {
    tasks: [row],
  } = await listTasks(me, { projectIds: [b] });
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

it("Kanban só traz concluídas dos últimos 14 dias; a Lista traz todas (ADR-047)", async () => {
  const p = (await createProject(system, { code: code(), name: "Visões C", kind: "client" })).id;
  const old = await createTask(me, { title: `velha ${run}`, projectIds: [p] });
  const recent = await createTask(me, { title: `recente ${run}`, projectIds: [p] });
  await completeTask(me, old.id);
  await completeTask(me, recent.id);
  await db
    .update(tasks)
    .set({ completedAt: new Date(Date.now() - 15 * 86_400_000) })
    .where(eq(tasks.id, old.id));
  expect(await titles(me, { projectIds: [p] }, { recentDone: true })).toEqual([`recente ${run}`]);
  expect(await titles(me, { projectIds: [p] })).toEqual([`recente ${run}`, `velha ${run}`]);
});

it("o limite corta só concluídas, nunca abertas (ADR-047)", async () => {
  const p = (await createProject(system, { code: code(), name: "Visões D", kind: "client" })).id;
  for (const t of ["aberta 1", "aberta 2", "feita 1", "feita 2"]) {
    const task = await createTask(me, { title: `${t} ${run}`, projectIds: [p] });
    if (t.startsWith("feita")) await completeTask(me, task.id);
  }
  const r = await listTasks(me, { projectIds: [p] }, { doneLimit: 1 });
  expect(r.truncated).toBe(true);
  expect(r.tasks.map((t) => t.title).sort()).toEqual([
    `aberta 1 ${run}`,
    `aberta 2 ${run}`,
    `feita 2 ${run}`, // a concluída mais recente
  ]);
  expect((await listTasks(me, { projectIds: [p] })).truncated).toBe(false);
});

it("Módulo 16: progresso das subtarefas vem na consulta das visões", async () => {
  const t = await createTask(me, { title: "Com subtarefas", projectIds: [a] });
  const plain = await createTask(me, { title: "Sem subtarefas", projectIds: [a] });
  const x = await addChecklistItem(me, t.id, "Um");
  await addChecklistItem(me, t.id, "Dois");
  await updateChecklistItem(me, x.id, { done: true });
  const { tasks: rows } = await listTasks(me, { projectIds: [a] });
  const row = (id: string) => rows.find((r) => r.id === id)!;
  expect([row(t.id).checklistDone, row(t.id).checklistTotal]).toEqual([1, 2]);
  expect([row(plain.id).checklistDone, row(plain.id).checklistTotal]).toEqual([0, 0]);
});

it("concluída traz quem concluiu; aberta não (Módulo 18, card compacto)", async () => {
  const p = (await createProject(system, { code: code(), name: "Visões D", kind: "client" })).id;
  const t = await createTask(me, { title: `quem ${run}`, projectIds: [p] });
  await createTask(me, { title: `aberta ${run}`, projectIds: [p] });
  await completeTask(other, t.id);
  const { tasks: rows } = await listTasks(me, { projectIds: [p] });
  expect(rows.find((r) => r.id === t.id)?.completedBy?.name).toBe("outra");
  expect(rows.find((r) => r.id !== t.id)?.completedBy).toBeNull();
});

it("Kanban com busca traz também as concluídas antigas que casam (Módulo 18)", async () => {
  const p = (await createProject(system, { code: code(), name: "Visões E", kind: "client" })).id;
  const old = await createTask(me, { title: `antigaz${run}`, projectIds: [p] });
  await completeTask(me, old.id);
  await db
    .update(tasks)
    .set({ completedAt: new Date(Date.now() - 20 * 86_400_000) })
    .where(eq(tasks.id, old.id));
  expect(await titles(me, { projectIds: [p] }, { recentDone: true })).toEqual([]);
  expect(await titles(me, { projectIds: [p], q: [`antigaz${run}`] }, { recentDone: true })).toEqual(
    [`antigaz${run}`],
  );
});
