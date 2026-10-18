import { eq, inArray } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { checklistItems, tasks, templates } from "@/db/schema";
import { addBusinessDays, todayISO } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { createMobileUnit, createProject, setProjectArchived } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createTask, listTaskTemplates } from "@/server/services/tasks";
import {
  applyProjectTemplate,
  saveTemplate,
  setTemplateArchived,
} from "@/server/services/templates";

const system: Actor = { kind: "system" };
const run = Date.now();
let ana: Actor & { kind: "user" };
let projectId: string;
let unit: { id: string; code: string };

const usage = async (id: string) =>
  (await db.select().from(templates).where(eq(templates.id, id)))[0].usageCount;

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Tpl",
    email: `tpl-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  ana = { kind: "user", userId: u.id, role: "member" };
  const code = `T${String(run).slice(-6)}`;
  projectId = (await createProject(system, { code, name: `Tpl ${run}`, kind: "client" })).id;
  const um = await createMobileUnit(system, { code: `UM${String(run).slice(-6)}`, projectId });
  unit = { id: um.id, code: um.code };
});

it("template de tarefa: conta o uso e troca {UM} pelo código da UM", async () => {
  const tpl = await saveTemplate(ana, null, {
    name: `Preparar UM ${run}`,
    kind: "task",
    payload: { title: "Preparar {UM} para operação", checklist: ["roteador"], dueInDays: 5 },
  });
  expect((await listTaskTemplates()).find((t) => t.id === tpl.id)?.payload.dueInDays).toBe(5);
  const t = await createTask(ana, {
    title: "Preparar {UM} para operação",
    projectIds: [projectId],
    mobileUnitIds: [unit.id],
    templateId: tpl.id,
  });
  expect(t.title).toBe(`Preparar ${unit.code} para operação`);
  expect(await usage(tpl.id)).toBe(1);

  await setTemplateArchived(ana, tpl.id, true);
  expect((await listTaskTemplates()).some((x) => x.id === tpl.id)).toBe(false);
  await expect(
    createTask(ana, { title: "x", projectIds: [projectId], templateId: tpl.id }),
  ).rejects.toThrow("Template não encontrado ou arquivado");
  expect(await usage(tpl.id)).toBe(1);
});

it("template de projeto cria todas as tarefas numa transação, com subtarefas e prazo útil", async () => {
  const tpl = await saveTemplate(ana, null, {
    name: `Implantação ${run}`,
    kind: "project",
    payload: {
      tasks: [
        { title: "Levantar rede", checklist: ["switch", "cabos"], dueInDays: 3 },
        { title: "Instalar {UM}", priority: "high" },
      ],
    },
  });
  const numbers = await applyProjectTemplate(ana, tpl.id, {
    projectIds: [projectId],
    mobileUnitIds: [unit.id],
  });
  expect(numbers).toHaveLength(2);
  const rows = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.number, numbers))
    .orderBy(tasks.number);
  expect(rows.map((r) => [r.title, r.projectId, r.priority])).toEqual([
    ["Levantar rede", projectId, "none"],
    [`Instalar ${unit.code}`, projectId, "high"],
  ]);
  expect(rows[0].dueDate).toBe(addBusinessDays(todayISO(), 3));
  const items = await db
    .select({ text: checklistItems.text })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, rows[0].id))
    .orderBy(checklistItems.position);
  expect(items.map((i) => i.text)).toEqual(["switch", "cabos"]);
  expect(await usage(tpl.id)).toBe(1);
});

it("falha em uma tarefa do template de projeto não cria nenhuma nem conta uso", async () => {
  const tpl = await saveTemplate(ana, null, {
    name: `Falha ${run}`,
    kind: "project",
    payload: { tasks: [{ title: "A" }, { title: "B" }] },
  });
  const archived = (
    await createProject(system, {
      code: `X${String(run).slice(-6)}`,
      name: `Arq ${run}`,
      kind: "client",
    })
  ).id;
  await setProjectArchived(system, archived, true);
  const before = await db.$count(tasks);
  await expect(applyProjectTemplate(ana, tpl.id, { projectIds: [archived] })).rejects.toThrow();
  expect(await db.$count(tasks)).toBe(before);
  expect(await usage(tpl.id)).toBe(0);
  // sem Projeto/Cliente também recusa (obrigatório, CLAUDE.md)
  await expect(applyProjectTemplate(ana, tpl.id, { projectIds: [] })).rejects.toThrow();
});

it("o tipo do template não muda na edição e automação não cria template", async () => {
  const tpl = await saveTemplate(ana, null, {
    name: `Tipo ${run}`,
    kind: "task",
    payload: { title: "t" },
  });
  await expect(
    saveTemplate(ana, tpl.id, {
      name: "Outro",
      kind: "project",
      payload: { tasks: [{ title: "a" }] },
    }),
  ).rejects.toThrow("Template não encontrado");
  await expect(
    saveTemplate({ kind: "automation", automationId: tpl.id, depth: 1 }, null, {
      name: "x",
      kind: "task",
      payload: {},
    }),
  ).rejects.toThrow("Só pessoas e agentes");
});
