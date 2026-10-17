import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import { createProject, listStatuses } from "@/server/services/catalog";
import { addComment } from "@/server/services/comments";
import { createMember } from "@/server/services/members";
import { addChecklistItem, createTask, updateTask } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();

it("histórico mostra pessoa, sistema e texto formatado; comentário fica de fora", async () => {
  const u = await createMember(system, {
    name: "Caio",
    email: `caio-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  const caio: Actor = { kind: "user", userId: u.id, role: "member" };
  const code = `H${String(run).slice(-6)}`;
  const project = await createProject(system, { code, name: `Histórico ${run}`, kind: "client" });
  const statuses = await listStatuses(system);
  const doing = statuses.find((s) => s.category === "in_progress")!;

  const task = await createTask(caio, { title: "Histórico", projectIds: [project.id] });
  await updateTask(caio, task.id, {
    statusId: doing.id,
    assigneeId: u.id,
    priority: "high",
    dueDate: "2026-10-20",
  });
  await addChecklistItem(system, task.id, "Trocar cabo");
  await addComment(caio, task.id, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "oi" }] }],
  });

  const rows = await listActivity(task.id);
  const lines = rows.map((r) => `${r.actor} ${r.text}`);
  expect(lines).toEqual(
    expect.arrayContaining([
      "Caio criou a tarefa",
      `Caio mudou o status de ${statuses.find((s) => s.id === task.statusId)!.name} para ${doing.name}`,
      "Caio atribuiu a Caio",
      "Caio mudou a prioridade de Sem prioridade para Alta",
      "Caio definiu o prazo para 20/10/2026",
      "Sistema adicionou a subtarefa “Trocar cabo”",
    ]),
  );
  expect(rows.some((r) => r.text.includes("coment"))).toBe(false);
});
