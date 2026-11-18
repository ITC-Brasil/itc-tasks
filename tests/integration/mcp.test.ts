import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { comments, taskEvents, tasks } from "@/db/schema";
import { PROJECT_REQUIRED } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { POST } from "@/app/mcp/route";
import {
  MAX_ACTIVE_AGENT_KEYS,
  createAgentKey,
  listAgentKeys,
  revokeAgentKey,
} from "@/server/services/agents";
import { createMobileUnit, createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createCycle } from "@/server/services/planning";

const system: Actor = { kind: "system" };
const run = String(Date.now()).slice(-6);
let person: Actor;
let email: string;
let writeKey: string;
let readKey: string;
let writeKeyId: string;
let code: string;

let rpcId = 0;
type Reply = { status: number; isError?: boolean; structuredContent: Record<string, unknown> };
async function call(
  key: string | null,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Reply> {
  const res = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  if (res.status !== 200) return { status: res.status, structuredContent: {} };
  const body = (await res.json()) as {
    result: { isError?: boolean; structuredContent: Record<string, unknown> };
  };
  return { status: 200, ...body.result };
}

beforeAll(async () => {
  code = `M${run}`;
  const project = await createProject(system, { code, name: `MCP ${run}`, kind: "client" });
  await createMobileUnit(system, { code: `UM-M${run}`, projectId: project.id });
  email = `agente-${run}@t.test`;
  const u = await createMember(system, {
    name: "Agente Dono",
    email,
    password: "senha-de-teste-123",
    role: "member",
  });
  person = { kind: "user", userId: u.id, role: "member" };
  const w = await createAgentKey(person, { name: "Escrita", access: "write" });
  const r = await createAgentKey(person, { name: "Leitura", access: "read" });
  [writeKey, writeKeyId, readKey] = [w.key, w.id, r.key];
});

it("sem token ou com token inválido → 401", async () => {
  expect((await call(null, "list_projects")).status).toBe(401);
  expect((await call("itct_inexistente", "list_projects")).status).toBe(401);
});

it("create_task sem projeto → VALIDATION com a mensagem do produto", async () => {
  const res = await call(writeKey, "create_task", { title: "Sem projeto" });
  expect(res.isError).toBe(true);
  expect(res.structuredContent).toEqual({ code: "VALIDATION", message: PROJECT_REQUIRED });
});

it("erro de schema do SDK também volta como VALIDATION", async () => {
  const res = await call(writeKey, "create_task", { title: 42, projectIds: [code] });
  expect(res.isError).toBe(true);
  expect(res.structuredContent?.code).toBe("VALIDATION");
});

it("cria, lê, atualiza, comenta e conclui pelos códigos legíveis, como agente", async () => {
  const created = await call(writeKey, "create_task", {
    title: `Trocar roteador ${run}`,
    projectIds: [code.toLowerCase()],
    mobileUnitIds: [`UM-M${run}`],
    assignee: "me",
    priority: "high",
    description: "Linha 1\n\nFalar com @" + email,
    checklist: ["Levar cabo", "Testar"],
    glpiTicket: 48213,
  });
  expect(created.isError).toBeFalsy();
  const id = created.structuredContent.id as string;
  expect(created.structuredContent).toMatchObject({
    projects: [code],
    mobileUnits: [`UM-M${run}`],
    assignee: email,
    priority: "high",
    glpiTicket: 48213,
    category: "todo",
  });

  const detail = await call(readKey, "get_task", { id });
  expect(detail.structuredContent).toMatchObject({
    description: "Linha 1\nFalar com @Agente Dono",
    checklist: [
      { text: "Levar cabo", done: false },
      { text: "Testar", done: false },
    ],
  });

  const updated = await call(writeKey, "update_task", {
    id: Number(id.replace("TI-", "")),
    priority: "low",
    checklistToggle: [{ index: 0, done: true }],
    checklistDue: [{ index: 1, dueDate: "2031-05-20" }],
  });
  expect(updated.structuredContent).toMatchObject({ priority: "low", projects: [code] });
  // Módulo 15: prazo da subtarefa pelo índice, e null limpa
  const due = await call(readKey, "get_task", { id });
  expect(due.structuredContent.checklist).toMatchObject([
    { text: "Levar cabo", done: true },
    { text: "Testar", done: false, dueDate: "2031-05-20" },
  ]);
  await call(writeKey, "update_task", { id, checklistDue: [{ index: 1, dueDate: null }] });
  const cleared = await call(readKey, "get_task", { id });
  expect(
    (cleared.structuredContent.checklist as { dueDate?: string }[])[1].dueDate,
  ).toBeUndefined();

  const listed = await call(readKey, "list_tasks", { project: code, query: "#48213" });
  expect((listed.structuredContent.tasks as { id: string }[]).map((t) => t.id)).toEqual([id]);

  await call(writeKey, "add_comment", { id, body: "Feito pelo agente" });
  const done = await call(writeKey, "complete_task", { id, comment: "Concluído" });
  expect(done.structuredContent.category).toBe("done");
  const again = await call(writeKey, "complete_task", { id });
  expect(again.isError).toBeFalsy();

  // histórico e comentários com actorKind agent e o token
  const events = await db
    .select({ kind: taskEvents.actorKind, key: taskEvents.apiKeyId })
    .from(taskEvents)
    .innerJoin(comments, eq(comments.taskId, taskEvents.taskId))
    .where(eq(comments.apiKeyId, writeKeyId));
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((e) => e.kind === "agent" && e.key === writeKeyId)).toBe(true);
});

it("token só-leitura lê mas não escreve (FORBIDDEN)", async () => {
  expect((await call(readKey, "list_projects")).isError).toBeFalsy();
  const res = await call(readKey, "create_task", { title: "Nada", projectIds: [code] });
  expect(res.structuredContent).toMatchObject({ code: "FORBIDDEN" });
});

it("referência inexistente → NOT_FOUND", async () => {
  const res = await call(writeKey, "create_task", { title: "X", projectIds: ["NAOEXISTE"] });
  expect(res.structuredContent).toMatchObject({ code: "NOT_FOUND" });
});

it("token revogado → 401 e continua listado como desativado", async () => {
  const key = await createAgentKey(person, { name: "Temporário", access: "read" });
  expect((await call(key.key, "list_projects")).status).toBe(200);
  await revokeAgentKey(person, key.id);
  expect((await call(key.key, "list_projects")).status).toBe(401);
  const keys = await listAgentKeys(person);
  expect(keys.find((k) => k.id === key.id)).toMatchObject({ enabled: false, write: false });
});

it("membro não cria token para outra pessoa nem revoga o de outra", async () => {
  const other = await createMember(system, {
    name: "Outra",
    email: `outra-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  const otherActor: Actor = { kind: "user", userId: other.id, role: "member" };
  await expect(
    createAgentKey(person, { name: "X", access: "read", userId: other.id }),
  ).rejects.toThrow();
  await expect(revokeAgentKey(otherActor, writeKeyId)).rejects.toThrow();
});

it("mais de 60 requisições por minuto no mesmo token → 429", async () => {
  const key = await createAgentKey(person, { name: "Rajada", access: "read" });
  const statuses: number[] = [];
  for (let i = 0; i < 61; i++) statuses.push((await call(key.key, "list_projects")).status);
  expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
  expect(statuses[60]).toBe(429);
});

it("update_task com índice de checklist inválido não grava nada (M-044)", async () => {
  const created = await call(writeKey, "create_task", {
    title: `Atômica ${run}`,
    projectIds: [code],
    checklist: ["Único"],
  });
  const id = created.structuredContent.id as string;
  const [{ taskId }] = await db
    .select({ taskId: taskEvents.taskId })
    .from(taskEvents)
    .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
    .where(eq(tasks.number, Number(id.replace("TI-", ""))));
  const before = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
  const res = await call(writeKey, "update_task", {
    id,
    priority: "urgent",
    checklist: ["Novo"],
    checklistToggle: [{ index: 1, done: true }], // índice sobre o checklist de antes: só 0 existe
  });
  expect(res.structuredContent).toMatchObject({ code: "NOT_FOUND" });
  const after = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
  expect(after).toHaveLength(before.length);
  const detail = await call(readKey, "get_task", { id });
  expect(detail.structuredContent).toMatchObject({
    priority: "none",
    checklist: [{ text: "Único" }],
  });
});

it("cycle por número grava e filtra; ciclo inexistente → NOT_FOUND (ADR-053)", async () => {
  const cycle = await createCycle(person, { startsOn: "2026-11-02", endsOn: "2026-11-13" });
  const created = await call(writeKey, "create_task", {
    title: "Com ciclo",
    projectIds: [code],
    cycle: cycle.number,
  });
  expect(created.isError).toBeFalsy();
  const id = String(created.structuredContent.id);
  const [row] = await db
    .select({ cycleId: tasks.cycleId })
    .from(tasks)
    .where(eq(tasks.number, Number(id.replace("TI-", ""))));
  expect(row.cycleId).toBe(cycle.id);
  const listed = await call(readKey, "list_tasks", { cycle: cycle.number });
  expect(listed.structuredContent.tasks).toEqual([expect.objectContaining({ id })]);
  for (const [name, args] of [
    ["create_task", { title: "Sem ciclo", projectIds: [code], cycle: 99_999_999 }],
    ["list_tasks", { cycle: 99_999_999 }],
  ] as const) {
    const res = await call(writeKey, name, args);
    expect(res.structuredContent, name).toMatchObject({ code: "NOT_FOUND" });
  }
});

it("token só-leitura não lista ferramentas de escrita (M-044)", async () => {
  const list = async (key: string) => {
    const res = await POST(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    return body.result.tools.map((t) => t.name).sort();
  };
  expect(await list(readKey)).toEqual([
    "get_task",
    "list_cycles",
    "list_involved",
    "list_mobile_units",
    "list_projects",
    "list_tasks",
  ]);
  expect(await list(writeKey)).toContain("create_task");
});

it("issue #25: recusa lote JSON-RPC e limita tokens ativos por pessoa", async () => {
  const msg = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/list" });
  const res = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readKey}`,
      },
      body: JSON.stringify([msg(1), msg(2), msg(3)]),
    }),
  );
  expect(res.status).toBe(400);

  const u = await createMember(system, {
    name: "Muitos Tokens",
    email: `tokens-${run}@t.test`,
    role: "member",
    password: "senha-de-teste-123",
  });
  const owner: Actor = { kind: "user", userId: u.id, role: "member" };
  const keys = [];
  for (let i = 0; i < MAX_ACTIVE_AGENT_KEYS; i++)
    keys.push(await createAgentKey(owner, { name: `t${i}`, access: "read" }));
  await expect(createAgentKey(owner, { name: "extra", access: "read" })).rejects.toThrow(/Limite/);
  await revokeAgentKey(owner, keys[0].id);
  await expect(createAgentKey(owner, { name: "extra", access: "read" })).resolves.toBeTruthy();
});
