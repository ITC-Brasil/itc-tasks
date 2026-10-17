import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { type RealtimeEvent, subscribe } from "@/server/realtime";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createTask, updateTask } from "@/server/services/tasks";

const system: Actor = { kind: "system" };

it("escrita de tarefa chega aos assinantes como task.changed, depois do commit", async () => {
  const run = String(Date.now()).slice(-6);
  const project = await createProject(system, {
    code: `R${run}`,
    name: `RT ${run}`,
    kind: "client",
  });
  const got: RealtimeEvent[] = [];
  const stop = await subscribe((e) => got.push(e));
  try {
    const task = await createTask(system, { title: "Ao vivo", projectIds: [project.id] });
    await updateTask(system, task.id, { title: "Ao vivo 2", priority: "high" });
    await expect.poll(() => got.length).toBeGreaterThanOrEqual(2);
    const mine = got.map((e) => JSON.parse(e.data)).filter((d) => d.id === task.id);
    expect(mine).toEqual([
      { id: task.id, number: task.number, fields: ["created"], by: null },
      { id: task.id, number: task.number, fields: ["field_changed"], by: null },
    ]);
    expect(got.every((e) => e.event === "task.changed")).toBe(true);

    // escrita recusada não notifica
    await expect(updateTask(system, task.id, { projectIds: [] })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 200));
    expect(got.filter((e) => JSON.parse(e.data).id === task.id)).toHaveLength(2);
  } finally {
    stop();
  }
});

it("`by` só para escrita da pessoa; o agente dela chega com `by: null` e atualiza a tela (M-039)", async () => {
  const run = String(Date.now()).slice(-6);
  const project = await createProject(system, {
    code: `Q${run}`,
    name: `RT2 ${run}`,
    kind: "client",
  });
  const u = await createMember(system, {
    name: "Eva",
    email: `eva-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  const person: Actor = { kind: "user", userId: u.id, role: "member" };
  const agent: Actor = { kind: "agent", userId: u.id, role: "member", apiKeyId: null as never };
  const got: { id: string; by: string | null; fields: string[] }[] = [];
  const stop = await subscribe((e) => got.push(JSON.parse(e.data)));
  try {
    const task = await createTask(person, { title: "Por pessoa", projectIds: [project.id] });
    await updateTask(agent, task.id, { priority: "low" });
    await expect.poll(() => got.filter((g) => g.id === task.id).length).toBe(2);
    expect(got.filter((g) => g.id === task.id).map((g) => g.by)).toEqual([u.id, null]);
  } finally {
    stop();
  }
});
