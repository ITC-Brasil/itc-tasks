import { and, eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { notifications, taskDeletions, taskEvents, tasks } from "@/db/schema";
import type { Actor } from "@/server/actor";
import { forSession } from "@/server/realtime";
import { listActivity } from "@/server/services/activity";
import {
  agentFromKey,
  createAgentKey,
  getTaskDetail,
  listAgentActivity,
  listTasksForAgent,
} from "@/server/services/agents";
import { addAttachment, getAttachment, listAttachments } from "@/server/services/attachments";
import { overdue } from "@/server/services/automations";
import { createProject } from "@/server/services/catalog";
import { addComment, listComments } from "@/server/services/comments";
import { createMember } from "@/server/services/members";
import { fanout, listNotifications } from "@/server/services/notifications";
import { createCycle, projectDashboard } from "@/server/services/planning";
import {
  addChecklistItem,
  addLink,
  bulkUpdateTasks,
  completeTask,
  createTask,
  deleteTasks,
  getTaskByNumber,
  listChecklistDue,
  listTasks,
  moveTask,
  removeChecklistItem,
  searchTasks,
  updateChecklistItem,
  updateTask,
} from "@/server/services/tasks";

// ADR-069: cada caminho de leitura com dono, outro membro, admin, agente do dono e agente de outra
// pessoa. Só o dono e o agente dele veem a tarefa pessoal.
type Person = Extract<Actor, { kind: "user" }>;
type Agent = Extract<Actor, { kind: "agent" }>;
const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let owner: Person, other: Person, admin: Person;
let ownerAgent: Agent, otherAgent: Agent;
let projectId: string;
let projectCode: string;
let personal: Awaited<ReturnType<typeof createTask>>;
let team: Awaited<ReturnType<typeof createTask>>;
let attachmentId: string;
let itemId: string;

const person = async (name: string, role: "admin" | "member"): Promise<Person> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-p${run}@t.test`,
    password: "senha-de-teste-123",
    role,
  });
  return { kind: "user", userId: u.id, role };
};
const agentOf = async (p: Person): Promise<Agent> => {
  const { key } = await createAgentKey(p, { name: `Agente ${run}`, access: "write" });
  const found = await agentFromKey(key);
  if (!("actor" in found)) throw new Error("token de teste inválido");
  return found.actor as Agent;
};
/** Roda o fanout dos eventos da tarefa, como o worker. */
const drain = async (taskId: string) => {
  const rows = await db
    .select({ id: taskEvents.id })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId));
  for (const r of rows) await fanout([r.id]);
};

let seers: [string, Actor][];
let blind: [string, Actor][];

beforeAll(async () => {
  [owner, other, admin] = [
    await person("Dona", "member"),
    await person("Outro", "member"),
    await person("Chefe", "admin"),
  ];
  [ownerAgent, otherAgent] = [await agentOf(owner), await agentOf(other)];
  seers = [
    ["dono", owner],
    ["agente do dono", ownerAgent],
  ];
  blind = [
    ["outro membro", other],
    ["admin", admin],
    ["agente de outra pessoa", otherAgent],
    ["sistema", system],
  ];
  projectCode = `PP${run}`;
  projectId = (
    await createProject(system, { code: projectCode, name: `Pessoal ${run}`, kind: "client" })
  ).id;
  team = await createTask(owner, { title: `Da equipe ${run}`, projectIds: [projectId] });
  personal = await createTask(owner, {
    title: `Segredo ${run}`,
    visibility: "personal",
    projectIds: [projectId],
    dueDate: "2020-01-01",
    checklist: ["Item pessoal"],
  });
  await addComment(owner, personal.id, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "nota reservada" }] }],
  });
  attachmentId = (await addAttachment(owner, personal.id, new File(["x"], "nota.log"))).id;
  itemId = (await getTaskByNumber(owner, personal.number))!.checklist[0].id;
  await updateChecklistItem(owner, itemId, { dueDate: "2031-03-03" });
  await addLink(owner, team.id, { kind: "relates", target: personal.number });
});

it("criação: sem Projeto/Cliente, sempre do dono, fora de ciclo; a da equipe segue exigindo projeto", async () => {
  const bare = await createTask(owner, {
    title: `Sem projeto ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  expect(bare).toMatchObject({
    visibility: "personal",
    projectId: null,
    assigneeId: owner.userId,
    creatorId: owner.userId,
  });
  const viaAgent = await createTask(ownerAgent, {
    title: `Do agente ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  expect(viaAgent).toMatchObject({ creatorId: owner.userId, assigneeId: owner.userId });

  await expect(
    createTask(owner, { title: "Equipe sem projeto", projectIds: [] }),
  ).rejects.toThrow();
  await expect(
    createTask(owner, {
      title: "x",
      visibility: "personal",
      projectIds: [],
      assigneeId: other.userId,
    }),
  ).rejects.toThrow("sempre de quem criou");
  await expect(
    createTask(system, { title: "x", visibility: "personal", projectIds: [] }),
  ).rejects.toThrow("só é criada por uma pessoa");
  const cycle = await createCycle(owner, { startsOn: "2031-01-06", endsOn: "2031-01-17" });
  await expect(
    createTask(owner, { title: "x", visibility: "personal", projectIds: [], cycleId: cycle.id }),
  ).rejects.toThrow("ciclo");
  await expect(updateTask(owner, personal.id, { cycleId: cycle.id })).rejects.toThrow("ciclo");
  await expect(updateTask(owner, personal.id, { assigneeId: other.userId })).rejects.toThrow(
    "sempre de quem criou",
  );
  // o banco também recusa (CHECK), mesmo se o service falhar
  await expect(
    db.update(tasks).set({ assigneeId: other.userId }).where(eq(tasks.id, personal.id)),
  ).rejects.toThrow();
  await expect(
    db.update(tasks).set({ projectId: null }).where(eq(tasks.id, team.id)),
  ).rejects.toThrow();
  // equipe → pessoal não existe
  await expect(
    updateTask(owner, team.id, { visibility: "personal", projectIds: [] } as never),
  ).rejects.toThrow();
});

it("detalhe, comentários, histórico e anexos: só o dono e o agente dele", async () => {
  for (const [who, actor] of seers) {
    expect((await getTaskByNumber(actor, personal.number))?.title, who).toBe(`Segredo ${run}`);
    expect(await listComments(actor, personal.id), who).toHaveLength(1);
    expect((await listActivity(actor, personal.id)).length, who).toBeGreaterThan(0);
    expect(await listAttachments(actor, personal.id), who).toHaveLength(1);
    expect((await getAttachment(actor, attachmentId))?.fileName, who).toBe("nota.log");
  }
  for (const [who, actor] of blind) {
    expect(await getTaskByNumber(actor, personal.number), who).toBeNull();
    await expect(listComments(actor, personal.id), who).rejects.toThrow("Tarefa não encontrada");
    await expect(listActivity(actor, personal.id), who).rejects.toThrow("Tarefa não encontrada");
    await expect(listAttachments(actor, personal.id), who).rejects.toThrow("Tarefa não encontrada");
    expect(await getAttachment(actor, attachmentId), who).toBeNull();
  }
});

it("visões, busca e calendário: fora das visões da equipe; nas pessoais só para o dono", async () => {
  const titles = async (actor: Actor, scope?: Parameters<typeof listTasks>[2]) =>
    (await listTasks(actor, { projectIds: [projectId] }, scope)).tasks.map((t) => t.title);
  for (const [who, actor] of [...seers, ...blind]) {
    // Kanban, Lista e Calendário da equipe: nem o dono vê a pessoal ali
    expect(await titles(actor), who).toEqual([`Da equipe ${run}`]);
  }
  for (const [who, actor] of seers) {
    expect(await titles(actor, { visibility: "personal" }), who).toEqual([`Segredo ${run}`]);
    expect((await titles(actor, { visibility: "all" })).sort(), who).toEqual([
      `Da equipe ${run}`,
      `Segredo ${run}`,
    ]);
    expect(
      (await searchTasks(actor, `Segredo ${run}`)).map((t) => t.id),
      who,
    ).toEqual([personal.id]);
    expect(await searchTasks(actor, `TI-${personal.number}`), who).toHaveLength(1);
    expect(
      (await listChecklistDue(actor, [personal.id])).map((c) => c.text),
      who,
    ).toEqual(["Item pessoal"]);
  }
  for (const [who, actor] of blind) {
    expect(await titles(actor, { visibility: "personal" }), who).toEqual([]);
    expect(await titles(actor, { visibility: "all" }), who).toEqual([`Da equipe ${run}`]);
    expect(await titles(actor, { visibility: "all", creatorId: owner.userId }), who).toEqual([
      `Da equipe ${run}`,
    ]);
    expect(await searchTasks(actor, `Segredo ${run}`), who).toEqual([]);
    expect(await searchTasks(actor, `TI-${personal.number}`), who).toEqual([]);
    expect(await searchTasks(actor, "nota reservada"), who).toEqual([]);
    expect(await listChecklistDue(actor, [personal.id]), who).toEqual([]);
  }
});

it("vínculo com tarefa pessoal só aparece para quem a vê", async () => {
  const links = async (actor: Actor) =>
    (await getTaskByNumber(actor, team.number))!.links.map((l) => l.number);
  for (const [who, actor] of seers) expect(await links(actor), who).toEqual([personal.number]);
  for (const [who, actor] of blind) expect(await links(actor), who).toEqual([]);
  await expect(
    addLink(other, team.id, { kind: "relates", target: personal.number }),
  ).rejects.toThrow(`TI-${personal.number} não encontrada`);
});

it("MCP: list_tasks e get_task respeitam o dono do token", async () => {
  const ids = async (agent: Agent, visibility?: "team" | "personal" | "all") =>
    (await listTasksForAgent(agent, { project: projectCode, visibility })).tasks.map((t) => t.id);
  const [p, t] = [`TI-${personal.number}`, `TI-${team.number}`];
  expect(await ids(ownerAgent)).toEqual([t]); // padrão: só equipe
  expect(await ids(ownerAgent, "personal")).toEqual([p]);
  expect((await ids(ownerAgent, "all")).sort()).toEqual([p, t].sort());
  expect(await ids(otherAgent, "personal")).toEqual([]);
  expect(await ids(otherAgent, "all")).toEqual([t]);
  expect(await getTaskDetail(ownerAgent, personal.number)).toMatchObject({
    id: p,
    visibility: "personal",
    checklist: [{ text: "Item pessoal", dueDate: "2031-03-03" }],
  });
  await expect(getTaskDetail(otherAgent, personal.number)).rejects.toThrow("não encontrada");

  // atividade de agente numa tarefa pessoal: o dono vê, o admin não
  await addChecklistItem(ownerAgent, personal.id, "Pelo agente");
  const seen = async (actor: Actor) =>
    (await listAgentActivity(actor, 200)).filter((a) => a.taskNumber === personal.number).length;
  expect(await seen(owner)).toBeGreaterThan(0);
  expect(await seen(admin)).toBe(0);
  expect(await seen(other)).toBe(0);
});

it("painel, automações e notificações: a pessoal fica fora da rotina da equipe", async () => {
  // tem Projeto/Cliente e prazo vencido, e mesmo assim não conta no painel
  for (const actor of [owner, other, admin]) {
    expect(await projectDashboard(actor, { projectId })).toMatchObject({ open: 1, overdue: 0 });
  }
  // nenhuma escrita da pessoal enfileira automação; o job da virada do dia também a ignora
  const queued = async () =>
    (
      await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'automation.evaluate'`,
      )
    ).rows[0].n;
  const before = await queued();
  const p2 = await createTask(owner, {
    title: `Sem automação ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  await completeTask(owner, p2.id);
  expect(await queued()).toBe(before);
  await db
    .update(tasks)
    .set({ dueDate: sql`current_date - 1` })
    .where(eq(tasks.id, p2.id));
  await overdue();
  expect(await queued()).toBe(before);

  // @menção numa pessoal não avisa ninguém; nem comentário, nem status
  await addComment(owner, personal.id, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "mention", attrs: { id: other.userId, label: "Outro" } }],
      },
    ],
  });
  await drain(personal.id);
  const got = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.taskId, personal.id));
  expect(got.every((n) => n.userId === owner.userId)).toBe(true);
  expect((await listNotifications(other, "all")).some((n) => n.number === personal.number)).toBe(
    false,
  );
});

it("SSE: evento de tarefa pessoal só chega à sessão do dono", () => {
  const event = (owner_: string | null) => ({
    event: "task.changed" as const,
    data: JSON.stringify({ id: "t", number: 1, fields: ["created"], by: null, owner: owner_ }),
  });
  expect(forSession(event(owner.userId), owner.userId)).toBe(
    JSON.stringify({ id: "t", number: 1, fields: ["created"], by: null }),
  );
  expect(forSession(event(owner.userId), other.userId)).toBeNull();
  expect(forSession(event(owner.userId), admin.userId)).toBeNull();
  expect(forSession(event(null), other.userId)).not.toBeNull(); // tarefa da equipe: todos
  const note = { event: "notification.created" as const, data: JSON.stringify({ userId: "a" }) };
  expect(forSession(note, "a")).toBe("{}");
  expect(forSession(note, "b")).toBeNull();
});

it("escrita por quem não vê: NOT_FOUND em todos os caminhos, até para o admin", async () => {
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "oi" }] }],
  };
  for (const [who, actor] of blind) {
    const refused = (p: Promise<unknown>) =>
      expect(p, who).rejects.toThrow(/não encontrada|não tem acesso|Só pessoas/);
    await refused(updateTask(actor, personal.id, { title: "invadida" }));
    await refused(completeTask(actor, personal.id));
    await refused(moveTask(actor, personal.id, { statusId: personal.statusId }));
    await refused(bulkUpdateTasks(actor, { taskIds: [personal.id], patch: { priority: "high" } }));
    await refused(addComment(actor, personal.id, doc));
    await refused(addChecklistItem(actor, personal.id, "x"));
    await refused(updateChecklistItem(actor, itemId, { done: true }));
    await refused(removeChecklistItem(actor, itemId));
    await refused(addLink(actor, personal.id, { kind: "relates", target: team.number }));
    await refused(deleteTasks(actor, { taskIds: [personal.id] }));
    if (actor.kind === "user" || actor.kind === "agent")
      await refused(addAttachment(actor, personal.id, new File(["x"], "x.log")));
  }
  expect((await getTaskByNumber(owner, personal.number))?.title).toBe(`Segredo ${run}`);
});

it("conversão: pessoal → equipe exige Projeto/Cliente, grava evento e abre para todos", async () => {
  const bare = await createTask(owner, {
    title: `Vai virar ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  await expect(updateTask(owner, bare.id, { visibility: "team" })).rejects.toThrow(
    "Escolha um Projeto/Cliente antes de mover a tarefa para a equipe.",
  );
  await expect(updateTask(other, bare.id, { visibility: "team" })).rejects.toThrow(
    "Tarefa não encontrada",
  );
  const moved = await updateTask(owner, bare.id, { visibility: "team", projectIds: [projectId] });
  expect(moved).toMatchObject({ visibility: "team", projectId });
  for (const [who, actor] of blind)
    expect((await getTaskByNumber(actor, bare.number))?.title, who).toBe(`Vai virar ${run}`);
  expect((await listActivity(other, bare.id)).map((a) => a.text)).toContain(
    "moveu a tarefa pessoal para a equipe",
  );
  // depois de virar da equipe, não pode ficar sem projeto
  await expect(updateTask(owner, bare.id, { projectIds: [] })).rejects.toThrow(
    "pelo menos um Projeto/Cliente",
  );
});

it("exclusão: o dono exclui a própria; o rastro não guarda o título", async () => {
  const gone = await createTask(owner, {
    title: `Apagar ${run}`,
    visibility: "personal",
    projectIds: [],
  });
  await expect(deleteTasks(admin, { taskIds: [gone.id] })).rejects.toThrow("Tarefa não encontrada");
  await expect(deleteTasks(ownerAgent, { taskIds: [gone.id] })).rejects.toThrow(); // agente nunca exclui
  expect(await deleteTasks(owner, { taskIds: [gone.id] })).toBe(1);
  const [trace] = await db
    .select()
    .from(taskDeletions)
    .where(and(eq(taskDeletions.number, gone.number)));
  expect(trace.title).toBe("(tarefa pessoal)");
});
