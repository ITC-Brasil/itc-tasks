import { todayISO } from "@/lib/dates";
import { parseTaskFilters } from "@/lib/validation/tasks";
import { requireActor } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listSavedFilters } from "@/server/services/saved-filters";
import { listTasks } from "@/server/services/tasks";

type Scope = NonNullable<Parameters<typeof listTasks>[2]>;

/**
 * Minhas Tarefas: o que cada aba lista (o service ainda aplica o visibleTo). Módulo 18, item 12:
 * as concluídas aparecem para o dono, inclusive as pessoais: Kanban com as dos últimos 14 dias,
 * Lista e Calendário com todas (antes Kanban e Lista eram só abertas e a pessoal concluída sumia).
 */
export function mineScope(aba: string, visao: string, userId: string): Scope {
  const view = { recentDone: visao === "" };
  switch (aba) {
    case "pessoais": // criadas pela pessoa e visíveis só para ela
      return { ...view, visibility: "personal" };
    case "atribuidas": // da equipe, atribuídas à pessoa
      return { ...view, assigneeId: userId };
    case "criadas": // da equipe, criadas pela pessoa (as pessoais ficam na aba própria)
      return { ...view, creatorId: userId };
    case "mencoes":
      return { ...view, mentionedUserId: userId };
    default: // Hoje e Minhas tarefas: as pessoais (sempre dela) e as da equipe com ela
      return { ...view, visibility: "all", assigneeId: userId };
  }
}

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
