import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { type RealtimeEvent, subscribe } from "@/server/realtime";
import { createProject } from "@/server/services/catalog";
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
