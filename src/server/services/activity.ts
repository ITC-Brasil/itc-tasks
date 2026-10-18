import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apikey,
  cycles,
  labels,
  milestones,
  mobileUnits,
  projects,
  taskEvents,
  user,
  workflowStatuses,
} from "@/db/schema";
import { priorityLabel } from "@/components/tasks/badges";
import type { Priority } from "@/lib/validation/tasks";

// ADR-048: o histórico formata o payload cru do ADR-042 com os nomes atuais

type Payload = {
  field?: string;
  from?: unknown;
  to?: unknown;
  action?: string;
  text?: string;
  kind?: string;
  target?: number;
  fileName?: string;
};
type Names = Map<string, string>;

const LINK = new Map([
  ["blocks", "bloqueia"],
  ["blocked_by", "bloqueada por"],
  ["relates", "relacionada a"],
]);
const CHECK = new Map([
  ["added", "adicionou a subtarefa"],
  ["checked", "concluiu a subtarefa"],
  ["unchecked", "reabriu a subtarefa"],
  ["edited", "editou a subtarefa"],
  ["removed", "removeu a subtarefa"],
]);

const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const name = (names: Names, id: unknown) => names.get(String(id)) ?? "(removido)";
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** "etiquetas: adicionou A, B; removeu C" */
function listChange(what: string, p: Payload, names: Names) {
  const from = ids(p.from);
  const to = ids(p.to);
  const added = to.filter((id) => !from.includes(id)).map((id) => name(names, id));
  const removed = from.filter((id) => !to.includes(id)).map((id) => name(names, id));
  const parts = [
    added.length && `adicionou ${added.join(", ")}`,
    removed.length && `removeu ${removed.join(", ")}`,
  ].filter(Boolean);
  return `${what}: ${parts.join("; ") || "sem mudança"}`;
}

function fieldChange(p: Payload, names: Names) {
  switch (p.field) {
    case "title":
      return `renomeou para “${String(p.to)}”`;
    case "priority":
      return `mudou a prioridade de ${priorityLabel(p.from as Priority)} para ${priorityLabel(p.to as Priority)}`;
    case "glpiTicket":
      return p.to ? `definiu o chamado GLPI #${String(p.to)}` : "removeu o chamado GLPI";
    case "dueDate":
      return p.to ? `definiu o prazo para ${brDate(String(p.to))}` : "removeu o prazo";
    case "description":
      return "editou a descrição";
    case "cycle":
      return p.to ? `moveu para o ${name(names, p.to)}` : "tirou do ciclo";
    case "milestone":
      return p.to ? `ligou ao marco ${name(names, p.to)}` : "tirou do marco";
    case "position":
      return "moveu para o topo da coluna";
    default:
      return `alterou ${p.field ?? "um campo"}`;
  }
}

export function describe(type: string, p: Payload, names: Names): string | null {
  switch (type) {
    case "created":
      return "criou a tarefa";
    case "status_changed":
      return `mudou o status de ${name(names, p.from)} para ${name(names, p.to)}`;
    case "assigned":
      return p.to ? `atribuiu a ${name(names, p.to)}` : "removeu o responsável";
    case "field_changed":
      return fieldChange(p, names);
    case "labels_changed":
      return listChange("etiquetas", p, names);
    case "projects_changed":
      return listChange("Projetos/Clientes", p, names);
    case "mobile_units_changed":
      return listChange("Unidades Móveis", p, names);
    case "checklist_changed":
      return `${CHECK.get(p.action ?? "") ?? "alterou a subtarefa"} “${p.text ?? ""}”`;
    case "link_added":
      return `vinculou: ${LINK.get(p.kind ?? "") ?? p.kind} TI-${p.target}`;
    case "link_removed":
      return `desfez o vínculo: ${LINK.get(p.kind ?? "") ?? p.kind} TI-${p.target}`;
    case "attachment_added":
      return `anexou ${p.fileName ?? "um arquivo"}`;
    default:
      return null; // commented/comment_edited: o próprio comentário aparece na linha do tempo
  }
}

/** Nomes atuais de tudo que o payload pode citar; os cadastros são pequenos (time de 4). */
async function allNames(): Promise<Names> {
  const rows = await Promise.all([
    db.select({ id: workflowStatuses.id, name: workflowStatuses.name }).from(workflowStatuses),
    db.select({ id: user.id, name: user.name }).from(user),
    db.select({ id: projects.id, name: projects.code }).from(projects),
    db.select({ id: mobileUnits.id, name: mobileUnits.code }).from(mobileUnits),
    db.select({ id: labels.id, name: labels.name }).from(labels),
    db.select({ id: cycles.id, name: sql<string>`'Ciclo ' || ${cycles.number}` }).from(cycles),
    db.select({ id: milestones.id, name: milestones.name }).from(milestones),
  ]);
  return new Map(rows.flat().map((r) => [r.id, r.name]));
}

/** Eventos da tarefa já formatados, mais antigos primeiro. */
export async function listActivity(taskId: string) {
  const [rows, names] = await Promise.all([
    db
      .select({
        id: taskEvents.id,
        type: taskEvents.type,
        payload: taskEvents.payload,
        actorKind: taskEvents.actorKind,
        actorName: user.name,
        actorInitials: user.initials,
        tokenName: apikey.name,
        createdAt: taskEvents.createdAt,
      })
      .from(taskEvents)
      .leftJoin(user, eq(user.id, taskEvents.actorUserId))
      .leftJoin(apikey, eq(apikey.id, taskEvents.apiKeyId))
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(asc(taskEvents.createdAt)),
    allNames(),
  ]);
  return rows.flatMap(({ type, payload, actorKind, actorName, ...r }) => {
    const text = describe(type, payload as Payload, names);
    if (!text) return [];
    const actor =
      actorKind === "automation" ? "Automação" : actorKind === "system" ? "Sistema" : actorName;
    return [{ ...r, actorKind, actor: actor ?? "Sistema", text }];
  });
}
