import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedFilters } from "@/db/schema";
import { savedFilterSchema, taskFiltersSchema } from "@/lib/validation/tasks";
import { type Actor, ForbiddenError } from "@/server/permissions";
import { TaskError } from "./tasks";

// ADR-046: cada pessoa vê e apaga só os seus
function ownerId(actor: Actor) {
  if (actor.kind !== "user" && actor.kind !== "agent") throw new ForbiddenError();
  return actor.userId;
}

export async function listSavedFilters(actor: Actor) {
  const rows = await db
    .select()
    .from(savedFilters)
    .where(eq(savedFilters.userId, ownerId(actor)))
    .orderBy(asc(savedFilters.name));
  // filtro antigo inválido vira "sem filtro" em vez de quebrar a tela
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    view: r.view,
    filters: taskFiltersSchema.catch(taskFiltersSchema.parse({})).parse(r.filters),
  }));
}

export async function createSavedFilter(actor: Actor, input: unknown) {
  const data = savedFilterSchema.parse(input);
  const [row] = await db
    .insert(savedFilters)
    .values({ ...data, userId: ownerId(actor) })
    .returning();
  return row;
}

export async function deleteSavedFilter(actor: Actor, id: string) {
  const removed = await db
    .delete(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, ownerId(actor))))
    .returning();
  if (!removed.length) throw new TaskError("NOT_FOUND", "Filtro salvo não encontrado");
}
