import { access } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import {
  attachments,
  checklistItems,
  comments,
  taskDeletions,
  taskEvents,
  tasks,
} from "@/db/schema";
import { type Actor, ForbiddenError } from "@/server/actor";
import { addAttachment, getAttachment } from "@/server/services/attachments";
import { createProject } from "@/server/services/catalog";
import { addComment } from "@/server/services/comments";
import { createMember } from "@/server/services/members";
import {
  addChecklistItem,
  createTask,
  deleteTasks,
  getTaskByNumber,
} from "@/server/services/tasks";

// M-117 item 2 / ADR-063: exclusão definitiva
const system: Actor = { kind: "system" };
const run = Date.now();
type U = Extract<Actor, { kind: "user" }>;
let ana: U, bia: U, admin: U, projectId: string;

const person = async (name: string, role: "admin" | "member"): Promise<U> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-del${run}@t.test`,
    password: "senha-de-teste-123",
    role,
  });
  return { kind: "user", userId: u.id, role };
};
const doc = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
const newTask = (actor: Actor, title = "Para excluir") =>
  createTask(actor, { title, projectIds: [projectId] });

beforeAll(async () => {
  ana = await person("Ana", "member");
  bia = await person("Bia", "member");
  admin = await person("Chefe", "admin");
  const code = `D${String(run).slice(-6)}`;
  projectId = (await createProject(system, { code, name: `Exclusão ${run}`, kind: "client" })).id;
});

it("member que não criou é recusado; agente e automação também", async () => {
  const t = await newTask(ana);
  await expect(deleteTasks(bia, { taskIds: [t.id] })).rejects.toBeInstanceOf(ForbiddenError);
  const agent: Actor = { kind: "agent", userId: ana.userId, role: "member", apiKeyId: "k" };
  await expect(deleteTasks(agent, { taskIds: [t.id] })).rejects.toBeInstanceOf(ForbiddenError);
  // tudo ou nada: uma proibida na lista barra todas
  const mine = await newTask(bia);
  await expect(deleteTasks(bia, { taskIds: [mine.id, t.id] })).rejects.toBeInstanceOf(
    ForbiddenError,
  );
  expect(
    await db
      .select()
      .from(tasks)
      .where(inArray(tasks.id, [t.id, mine.id])),
  ).toHaveLength(2);
});

it("tarefa do sistema só o admin exclui; a do agente conta como do dono", async () => {
  const bySystem = await newTask(system);
  await expect(deleteTasks(ana, { taskIds: [bySystem.id] })).rejects.toBeInstanceOf(ForbiddenError);
  // criada pelo agente da Ana: creatorId = Ana, createdVia = agent (sem token real no teste)
  const byAgent = await newTask(ana);
  await db.update(tasks).set({ createdVia: "agent" }).where(eq(tasks.id, byAgent.id));
  expect(await deleteTasks(ana, { taskIds: [byAgent.id] })).toBe(1);
  expect(await deleteTasks(admin, { taskIds: [bySystem.id] })).toBe(1);
});

it("o criador exclui: dependentes, arquivo e rota somem; fica o rastro; o número não volta", async () => {
  const t = await newTask(ana, "Com tudo");
  await addChecklistItem(ana, t.id, "passo");
  await addComment(ana, t.id, doc("comentário"));
  const file = await addAttachment(ana, t.id, new File(["conteúdo"], "nota.txt"));
  const path = (await getAttachment({ kind: "system" }, file.id))!.path;

  expect(await deleteTasks(ana, { taskIds: [t.id] })).toBe(1);

  for (const table of [checklistItems, comments, taskEvents, attachments])
    expect(await db.select().from(table).where(eq(table.taskId, t.id))).toHaveLength(0);
  await expect(access(path)).rejects.toThrow();
  expect(await getTaskByNumber(ana, t.number)).toBeNull();
  const [trail] = await db.select().from(taskDeletions).where(eq(taskDeletions.number, t.number));
  expect(trail).toMatchObject({ title: "Com tudo", deletedBy: ana.userId });
  expect((await newTask(ana)).number).toBeGreaterThan(t.number);
});

it("admin exclui a de outra pessoa", async () => {
  const t = await newTask(bia);
  expect(await deleteTasks(admin, { taskIds: [t.id] })).toBe(1);
  expect(await getTaskByNumber(admin, t.number)).toBeNull();
});
