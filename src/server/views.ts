import { todayISO } from "@/lib/dates";
import { parseTaskFilters } from "@/lib/validation/tasks";
import { requireActor } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listSavedFilters } from "@/server/services/saved-filters";
import { listTasks } from "@/server/services/tasks";

/** Dados comuns de Kanban, Lista e Calendário (ADR-046). */
export async function loadView(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  { recentDone = false } = {}, // ADR-047: Kanban
) {
  const actor = await requireActor();
  const filters = parseTaskFilters(await searchParams);
  const [{ tasks, truncated }, options, saved] = await Promise.all([
    listTasks(actor, filters, { recentDone }),
    getTaskFormOptionsAction(),
    listSavedFilters(actor),
  ]);
  return { filters, tasks, truncated, options, saved, today: todayISO() };
}
