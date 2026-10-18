import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { templates, user } from "@/db/schema";
import { addBusinessDays, todayISO } from "@/lib/dates";
import {
  type TemplateInput,
  projectTemplatePayloadSchema,
  templateSchema,
  useProjectTemplateSchema,
} from "@/lib/validation/templates";
import { createTaskSchema } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { TaskError, countTemplateUse, insertTask, unitTitle } from "./tasks";

// ADR-052: membros criam, editam, arquivam e usam; nunca se exclui

function assertPerson(actor: Actor) {
  if (actor.kind !== "user" && actor.kind !== "agent")
    throw new TaskError("VALIDATION", "Só pessoas e agentes mexem em templates");
  return actor.userId;
}

export async function listTemplates() {
  return db
    .select({
      id: templates.id,
      name: templates.name,
      kind: templates.kind,
      payload: templates.payload,
      usageCount: templates.usageCount,
      archivedAt: templates.archivedAt,
      createdBy: user.name,
    })
    .from(templates)
    .innerJoin(user, eq(user.id, templates.createdById))
    .orderBy(asc(templates.archivedAt), desc(templates.usageCount), asc(templates.name));
}

export async function saveTemplate(actor: Actor, id: string | null, input: TemplateInput) {
  const createdById = assertPerson(actor);
  const data = templateSchema.parse(input);
  if (!id) {
    const [row] = await db
      .insert(templates)
      .values({ ...data, createdById })
      .returning();
    return row;
  }
  // o tipo não muda depois de criado: o payload de um não serve no outro
  const [row] = await db
    .update(templates)
    .set({ name: data.name, payload: data.payload })
    .where(and(eq(templates.id, id), eq(templates.kind, data.kind)))
    .returning();
  if (!row) throw new TaskError("NOT_FOUND", "Template não encontrado");
  return row;
}

export async function setTemplateArchived(actor: Actor, id: string, archived: boolean) {
  assertPerson(actor);
  const [row] = await db
    .update(templates)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(templates.id, id))
    .returning({ id: templates.id });
  if (!row) throw new TaskError("NOT_FOUND", "Template não encontrado");
}

/** Cria todas as tarefas do template de projeto numa transação só; devolve os números. */
export async function applyProjectTemplate(actor: Actor, id: string, input: unknown) {
  const target = useProjectTemplateSchema.parse(input);
  return db.transaction(async (tx) => {
    const tpl = await countTemplateUse(tx, id, "project");
    const { tasks } = projectTemplatePayloadSchema.parse(tpl.payload);
    const today = todayISO();
    const numbers: number[] = [];
    for (const t of tasks) {
      const data = createTaskSchema.parse({
        ...t,
        title: await unitTitle(tx, t.title, target.mobileUnitIds),
        dueDate: t.dueInDays !== undefined ? addBusinessDays(today, t.dueInDays) : undefined,
        projectIds: target.projectIds,
        mobileUnitIds: target.mobileUnitIds,
      });
      numbers.push((await insertTask(tx, actor, data)).number);
    }
    return numbers;
  });
}
