import { asc, eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { taskEvents, tasks, user, workflowStatuses } from "@/db/schema";
import { PROJECT_REQUIRED } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import {
  createLabel,
  createMobileUnit,
  createProject,
  createStatus,
  listStatuses,
  setLabelArchived,
  setMobileUnitArchived,
  setProjectArchived,
} from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import {
  addChecklistItem,
  addLink,
  bulkUpdateTasks,
  completeTask,
  createTask,
  docText,
  getTaskByNumber,
  moveTask,
  updateChecklistItem,
  updateTask,
} from "@/server/services/tasks";

const system: Actor = { kind: "system" };
let actor: Actor;
let projectId: string;
const status: Record<"backlog" | "todo" | "in_progress" | "done", string> = {} as never;
const run = Date.now();
// siglas aleatórias de 4 letras: o banco de teste acumula execuções
const letters = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join("");
const code = letters();

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Tarefas",
    email: `tasks-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  actor = { kind: "user", userId: u.id, role: "member" };
  projectId = (await createProject(system, { code, name: `Tarefas ${run}`, kind: "client" })).id;
  const existing = await listStatuses(system);
  for (const category of ["backlog", "todo", "in_progress", "done"] as const) {
    const s =
      existing.find((x) => x.category === category) ??
      (await createStatus(system, { name: `${category} ${run}`, category }));
    status[category] = s.id;
  }
});

const events = (taskId: string) =>
  db
    .select({ type: taskEvents.type, payload: taskEvents.payload, kind: taskEvents.actorKind })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.createdAt));

it("sem Projeto/Cliente é recusado e nada é gravado", async () => {
  const before = await db.$count(tasks);
  await expect(createTask(actor, { title: "Sem projeto" } as never)).rejects.toThrow(
    PROJECT_REQUIRED,
  );
  await expect(createTask(actor, { title: "Vazio", projectIds: [] })).rejects.toThrow(
    PROJECT_REQUIRED,
  );
  await expect(updateTask(actor, crypto.randomUUID(), { projectIds: [] })).rejects.toThrow();
  expect(await db.$count(tasks)).toBe(before);
});

it("Projeto/Cliente, UM e etiqueta arquivados são recusados", async () => {
  const p = await createProject(system, {
    code: letters(),
    name: "Arquivado",
    kind: "client",
  });
  await setProjectArchived(system, p.id, true);
  await expect(createTask(actor, { title: "x", projectIds: [p.id] })).rejects.toThrow(
    "Projeto/Cliente arquivado",
  );

  const um = await createMobileUnit(system, { code: `UM-${run}`, projectId });
  await setMobileUnitArchived(system, um.id, true);
  await expect(
    createTask(actor, { title: "x", projectIds: [projectId], mobileUnitIds: [um.id] }),
  ).rejects.toThrow("Unidade Móvel arquivado");

  const l = await createLabel(system, { name: `arq-${run}`, colorToken: "label-blue" });
  await setLabelArchived(system, l.id, true);
  await expect(
    createTask(actor, { title: "x", projectIds: [projectId], labelIds: [l.id] }),
  ).rejects.toThrow("Etiqueta arquivada");
});

it("cria no primeiro status `todo`, com checklist e evento `created`", async () => {
  const t = await createTask(actor, {
    title: "Trocar switch",
    projectIds: [projectId],
    glpiTicket: "48213",
    checklist: ["Comprar", "Instalar"],
    descriptionJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Rack 2" }] }],
    },
  });
  const [s] = await db.select().from(workflowStatuses).where(eq(workflowStatuses.id, t.statusId));
  expect(s.category).toBe("todo");
  expect(t.glpiTicket).toBe(48213);
  expect(t.descriptionText).toBe("Rack 2");
  expect(t.creatorId).toBe((actor as { userId: string }).userId);
  const detail = await getTaskByNumber(actor, t.number);
  expect(detail?.checklist.map((c) => c.text)).toEqual(["Comprar", "Instalar"]);
  expect(await events(t.id)).toEqual([{ type: "created", payload: {}, kind: "user" }]);
});

it("completedAt ao entrar em `done` e limpo ao sair; complete é idempotente", async () => {
  const t = await createTask(actor, { title: "Concluir", projectIds: [projectId] });
  const done = await updateTask(actor, t.id, { statusId: status.done });
  expect(done.completedAt).toBeInstanceOf(Date);
  const again = await completeTask(actor, t.id);
  expect(again.completedAt).toEqual(done.completedAt);
  const reopened = await updateTask(actor, t.id, { statusId: status.in_progress });
  expect(reopened.completedAt).toBeNull();
  const completed = await completeTask(actor, t.id);
  expect(completed.completedAt).toBeInstanceOf(Date);
  expect((await events(t.id)).map((e) => e.type)).toEqual([
    "created",
    "status_changed",
    "status_changed",
    "status_changed",
  ]);
});

it("update grava um evento por campo alterado e ignora o que não mudou", async () => {
  const t = await createTask(actor, { title: "Antes", projectIds: [projectId], priority: "low" });
  await updateTask(actor, t.id, { title: "Depois", priority: "low", glpiTicket: 7 });
  const e = await events(t.id);
  expect(e.slice(1)).toEqual([
    {
      type: "field_changed",
      payload: { field: "title", from: "Antes", to: "Depois" },
      kind: "user",
    },
    { type: "field_changed", payload: { field: "glpiTicket", from: null, to: 7 }, kind: "user" },
  ]);
});

it("move ordena pela posição fracionária dentro do status", async () => {
  const a = await createTask(actor, {
    title: "A",
    projectIds: [projectId],
    statusId: status.backlog,
  });
  const b = await createTask(actor, {
    title: "B",
    projectIds: [projectId],
    statusId: status.backlog,
  });
  const c = await createTask(actor, { title: "C", projectIds: [projectId], statusId: status.todo });
  await moveTask(actor, c.id, { statusId: status.backlog, afterTaskId: a.id });
  const order = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.statusId, status.backlog))
    .orderBy(asc(tasks.position));
  const ids = order.map((r) => r.id).filter((id) => [a.id, b.id, c.id].includes(id));
  expect(ids).toEqual([a.id, c.id, b.id]);
  await moveTask(actor, b.id, { statusId: status.backlog, afterTaskId: null });
  const [first] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.statusId, status.backlog))
    .orderBy(asc(tasks.position))
    .limit(1);
  expect(first.id).toBe(b.id);
});

it("bulk é tudo ou nada", async () => {
  const a = await createTask(actor, { title: "Bulk A", projectIds: [projectId] });
  await expect(
    bulkUpdateTasks(actor, { taskIds: [a.id, crypto.randomUUID()], patch: { priority: "urgent" } }),
  ).rejects.toThrow("Tarefa não encontrada");
  expect((await getTaskByNumber(actor, a.number))?.priority).toBe("none");
  const [r] = await bulkUpdateTasks(actor, { taskIds: [a.id], patch: { priority: "urgent" } });
  expect(r.priority).toBe("urgent");
});

it("checklist e vínculos (bloqueia ↔ bloqueada por)", async () => {
  const a = await createTask(actor, { title: "Link A", projectIds: [projectId] });
  const b = await createTask(actor, { title: "Link B", projectIds: [projectId] });
  const item = await addChecklistItem(actor, a.id, "Testar");
  await updateChecklistItem(actor, item.id, { done: true });
  await addLink(actor, a.id, { kind: "blocks", target: `TI-${b.number}` });
  await addLink(actor, a.id, { kind: "blocks", target: b.number }); // repetido: sem efeito
  await expect(addLink(actor, a.id, { kind: "relates", target: a.number })).rejects.toThrow(
    "Uma tarefa não se vincula a ela mesma",
  );
  const da = await getTaskByNumber(actor, a.number);
  const db_ = await getTaskByNumber(actor, b.number);
  expect(da?.checklist[0].done).toBe(true);
  expect(da?.links).toEqual([expect.objectContaining({ kind: "blocks", number: b.number })]);
  expect(db_?.links).toEqual([expect.objectContaining({ kind: "blocked_by", number: a.number })]);
  expect((await events(a.id)).map((e) => e.type)).toEqual([
    "created",
    "checklist_changed",
    "checklist_changed",
    "link_added",
  ]);
});

it("tarefa criada pelo sistema: ator system, criador = primeiro admin ativo (ADR-045)", async () => {
  await createMember(system, {
    name: "Admin teste",
    email: `tasks-admin-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "admin",
  });
  const t = await createTask(system, { title: "Pelo sistema", projectIds: [projectId] });
  expect(t.createdVia).toBe("system");
  const [creator] = await db.select().from(user).where(eq(user.id, t.creatorId));
  expect(creator.role).toBe("admin");
  expect(creator.banned).not.toBe(true);
  const [e] = await events(t.id);
  expect(e.kind).toBe("system");
});

it("docText junta parágrafos", () => {
  expect(
    docText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "c" }] },
      ],
    }),
  ).toBe("ab\nc");
});

it("sem responsável automático: omitido fica sem responsável (ADR-045)", async () => {
  const t = await createTask(actor, { title: "Omitido", projectIds: [projectId] });
  expect(t.assigneeId).toBeNull();
});

it("vários Projetos/Clientes e UMs; UM de projeto não escolhido recusada (ADR-045)", async () => {
  const other = await createProject(system, { code: letters(), name: "Outro", kind: "client" });
  const mine = await createMobileUnit(system, { code: `UM-P-${run}`, projectId });
  const own = await createMobileUnit(system, { code: `UM-O-${run}`, projectId: other.id });
  await expect(
    createTask(actor, { title: "x", projectIds: [projectId], mobileUnitIds: [own.id] }),
  ).rejects.toThrow(`A Unidade Móvel UM-O-${run} pertence a outro Projeto/Cliente`);
  await expect(createMobileUnit(system, { code: `UM-L-${run}` } as never)).rejects.toThrow(
    "Escolha o Projeto/Cliente da Unidade Móvel", // ADR-044
  );

  const t = await createTask(actor, {
    title: "Dois projetos",
    projectIds: [other.id, projectId],
    mobileUnitIds: [mine.id, own.id],
  });
  expect(t.projectId).toBe(other.id); // o primeiro é o principal
  const d = await getTaskByNumber(actor, t.number);
  expect(d?.projects.map((p) => p.id)).toEqual([other.id, projectId]);
  expect(d?.units.map((u) => u.id).sort()).toEqual([mine.id, own.id].sort());

  // remover um projeto que ainda tem UM sua na tarefa é recusado
  await expect(updateTask(actor, t.id, { projectIds: [projectId] })).rejects.toThrow(
    `Remova antes a UM UM-O-${run}: ela é do Projeto/Cliente ${other.code}`,
  );
  const moved = await updateTask(actor, t.id, {
    projectIds: [projectId],
    mobileUnitIds: [mine.id],
  });
  expect(moved.projectId).toBe(projectId);
  expect(moved.mobileUnitId).toBe(mine.id);
  const e = (await events(t.id)).slice(1);
  expect(e.map((x) => x.type)).toEqual(["projects_changed", "mobile_units_changed"]);
  expect(e[0].payload).toEqual({
    from: expect.arrayContaining([other.id, projectId]),
    to: [projectId],
  });
});

it("migração 0007 preenche task_projects de toda tarefa", async () => {
  const [{ missing }] = (
    await db.execute<{ missing: number }>(
      sql`SELECT count(*)::int AS missing FROM tasks t WHERE NOT EXISTS
        (SELECT 1 FROM task_projects tp WHERE tp.task_id = t.id AND tp.project_id = t.project_id)`,
    )
  ).rows;
  expect(missing).toBe(0);
});

it("descrição igual não grava nem mexe no updatedAt", async () => {
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
  };
  const t = await createTask(actor, {
    title: "Desc",
    projectIds: [projectId],
    descriptionJson: doc,
  });
  // mesma descrição com as chaves em outra ordem
  const same = await updateTask(actor, t.id, {
    descriptionJson: {
      content: [{ content: [{ text: "a", type: "text" }], type: "paragraph" }],
      type: "doc",
    },
  });
  expect(same.updatedAt).toEqual(t.updatedAt);
  expect((await events(t.id)).map((e) => e.type)).toEqual(["created"]);
});

it("reordenar no mesmo status atualiza o updatedAt", async () => {
  await createTask(actor, { title: "Ord A", projectIds: [projectId], statusId: status.backlog });
  const b = await createTask(actor, {
    title: "Ord B",
    projectIds: [projectId],
    statusId: status.backlog,
  });
  const moved = await moveTask(actor, b.id, { statusId: status.backlog, afterTaskId: null });
  expect(moved.updatedAt.getTime()).toBeGreaterThan(b.updatedAt.getTime());
});
