import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { mobileUnits, projects, taskImports, user } from "@/db/schema";
import type { Priority } from "@/lib/validation/tasks";
import { createTaskSchema } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { type Tx, firstStatus, insertTask } from "./tasks";

// ADR-056: importação única das tarefas abertas do Windshift, silenciosa e idempotente.
// Formato da exportação: data/windshift/LEIAME.md (REST v1 do Windshift 0.8.9).

const SOURCE = "windshift";

type Ref = { id: number; name?: string; builtin_key?: string } | null;
type Person = { email?: string; full_name?: string } | null;
export type WsItem = {
  id: number;
  key: string;
  title: string;
  description?: string | null;
  created_at: string;
  status: Ref;
  priority: Ref;
  item_type: Ref;
  assignee?: Person;
  parent_id?: number | null;
  parent_title?: string | null;
  // pelo id do campo ("1") ou, em alguns itens, pelo nome ("Projetos/Clientes")
  custom_fields?: Record<string, unknown> | null;
};
export type WsField = {
  id: number;
  name: string;
  // a REST v1 devolve as opções como texto JSON
  options?: string | { items?: { id: number; label: string }[] } | null;
};
export type WsExport = { items: WsItem[]; customFields: WsField[] };

// mapeamento explícito (M-085); status fora daqui é erro, não palpite
const STATUS = new Map<string, "backlog" | "todo" | "in_progress" | null>([
  ["Backlog", "backlog"],
  ["Open", "todo"],
  ["In Progress", "in_progress"],
  ["Aguardando", "in_progress"],
  ["Done", null], // concluída: fica fora
]);
const PRIORITY = new Map<string, Priority>([
  ["critical", "urgent"],
  ["high", "high"],
  ["medium", "medium"],
  ["low", "low"],
]);
// rótulos do Windshift que não são a sigla do seed; o resto é a própria sigla
const PROJECT_ALIAS = new Map([
  ["ITCBrasil", "ITC"],
  ["Mobility", "MOBILITY"],
]);
const FIELD_PROJECTS = "Projetos/Clientes";
const FIELD_UNITS = "Unidade Móvel";
const FALLBACK_PROJECT = "ACL";

export function loadExport(dir: string): WsExport {
  const read = (f: string) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- pasta passada pelo operador na linha de comando
    JSON.parse(readFileSync(path.join(dir, f), "utf8")) as unknown;
  return {
    items: read("items.json") as WsItem[],
    customFields: read("custom-fields.json") as WsField[],
  };
}

const brDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Texto do Windshift → documento Tiptap, um parágrafo por linha não vazia. */
function toDoc(lines: string[]) {
  return {
    type: "doc",
    content: lines.map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] })),
  };
}

/** Rótulos escolhidos num campo multiselect, procurando pelo id ou pelo nome do campo. */
function labelsOf(item: WsItem, field: WsField | undefined): string[] {
  if (!field) return [];
  const raw = item.custom_fields?.[String(field.id)] ?? item.custom_fields?.[field.name];
  const ids = Array.isArray(raw) ? raw : [];
  const parsed = (
    typeof field.options === "string" ? JSON.parse(field.options) : field.options
  ) as Exclude<WsField["options"], string>;
  const options = new Map((parsed?.items ?? []).map((o) => [o.id, o.label]));
  return ids.map((id) => options.get(Number(id)) ?? `#${String(id)}`);
}

export type PlanRow = {
  sourceId: string;
  key: string;
  title: string;
  projects: string[];
  units: string[];
  status: string;
  priority: Priority;
  assignee: string | null;
  data: ReturnType<typeof createTaskSchema.parse>;
};
export type ImportReport = {
  rows: PlanRow[];
  errors: { key: string; reason: string }[];
  ignored: { key: string; reason: string }[];
  skipped: string[]; // já importadas
  inFallback: number;
  assigneeNotFound: { key: string; email: string }[];
  imported: number;
};

/** Valida e resolve tudo contra o banco, sem gravar. */
async function plan(tx: Tx, exp: WsExport): Promise<ImportReport> {
  const report: ImportReport = {
    rows: [],
    errors: [],
    ignored: [],
    skipped: [],
    inFallback: 0,
    assigneeNotFound: [],
    imported: 0,
  };
  const projectRows = await tx
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(isNull(projects.archivedAt));
  const projectByCode = new Map(projectRows.map((p) => [p.code, p.id]));
  const unitRows = await tx
    .select({ id: mobileUnits.id, code: mobileUnits.code, projectId: mobileUnits.projectId })
    .from(mobileUnits)
    .where(isNull(mobileUnits.archivedAt));
  const unitByCode = new Map(unitRows.map((u) => [u.code, u]));
  const members = await tx
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)));
  const memberByEmail = new Map(members.map((m) => [m.email.toLowerCase(), m.id]));
  const done = new Set(
    (
      await tx
        .select({ sourceId: taskImports.sourceId })
        .from(taskImports)
        .where(eq(taskImports.source, SOURCE))
    ).map((r) => r.sourceId),
  );
  const statusIds = new Map<string, string>();
  const statusId = async (category: "backlog" | "todo" | "in_progress") => {
    if (!statusIds.has(category)) statusIds.set(category, (await firstStatus(tx, category)).id);
    return statusIds.get(category)!;
  };

  const fieldProjects = exp.customFields.find((f) => f.name === FIELD_PROJECTS);
  const fieldUnits = exp.customFields.find((f) => f.name === FIELD_UNITS);
  const byId = new Map(exp.items.map((i) => [i.id, i]));

  for (const item of exp.items) {
    const fail = (reason: string) => report.errors.push({ key: item.key, reason });
    if (item.item_type?.builtin_key === "epic") {
      report.ignored.push({ key: item.key, reason: "Epic (as filhas abertas entram sozinhas)" });
      continue;
    }
    const statusName = item.status?.name ?? "";
    if (!STATUS.has(statusName)) {
      fail(`status "${statusName}" sem mapeamento`);
      continue;
    }
    const category = STATUS.get(statusName);
    if (!category) continue; // concluída
    if (done.has(String(item.id))) {
      report.skipped.push(item.key);
      continue;
    }

    const projectCodes = labelsOf(item, fieldProjects).map((l) => PROJECT_ALIAS.get(l) ?? l);
    const unknownProject = projectCodes.filter((c) => !projectByCode.has(c));
    if (unknownProject.length) fail(`Projeto/Cliente desconhecido: ${unknownProject.join(", ")}`);
    if (projectCodes.length === 0) {
      projectCodes.push(FALLBACK_PROJECT);
      report.inFallback++;
    }
    const unitCodes = labelsOf(item, fieldUnits);
    const unknownUnit = unitCodes.filter((c) => !unitByCode.has(c));
    if (unknownUnit.length) fail(`Unidade Móvel desconhecida: ${unknownUnit.join(", ")}`);
    const projectIds = projectCodes.flatMap((c) => projectByCode.get(c) ?? []);
    // ADR-045: UM com cliente pertence a um dos projetos da tarefa
    const outside = unitCodes.filter((c) => {
      const u = unitByCode.get(c);
      return u?.projectId && !projectIds.includes(u.projectId);
    });
    if (outside.length) fail(`UM fora dos Projetos/Clientes da tarefa: ${outside.join(", ")}`);

    const priorityKey = item.priority?.builtin_key ?? "";
    const priority = PRIORITY.get(priorityKey);
    if (!priority) fail(`prioridade "${priorityKey}" sem mapeamento`);

    const email = item.assignee?.email?.toLowerCase() ?? "";
    const assigneeId = email ? (memberByEmail.get(email) ?? null) : null;
    if (email && !assigneeId) report.assigneeNotFound.push({ key: item.key, email });

    const parent = item.parent_id ? byId.get(item.parent_id) : undefined;
    const epicTitle =
      parent?.item_type?.builtin_key === "epic" ? parent.title : (item.parent_title ?? null);
    const lines = [
      ...(item.description ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      ...(epicTitle ? [`Epic no Windshift: ${epicTitle}`] : []),
      `Importada do Windshift — ${item.key} (ID ${item.id}), criada em ${brDate(item.created_at)}`,
    ];
    if (!priority || unknownProject.length || unknownUnit.length || outside.length) continue;

    const parsed = createTaskSchema.safeParse({
      title: item.title,
      projectIds,
      mobileUnitIds: unitCodes.map((c) => unitByCode.get(c)!.id),
      statusId: await statusId(category),
      priority,
      assigneeId,
      descriptionJson: toDoc(lines),
    });
    if (!parsed.success) {
      fail(parsed.error.issues.map((i) => i.message).join("; "));
      continue;
    }
    report.rows.push({
      sourceId: String(item.id),
      key: item.key,
      title: parsed.data.title,
      projects: projectCodes,
      units: unitCodes,
      status: statusName,
      priority,
      assignee: assigneeId ? email : null,
      data: parsed.data,
    });
  }
  return report;
}

class Rollback extends Error {}

/** Valida tudo; sem erro e sem `dryRun`, grava numa transação só. Com erro, não grava nada. */
export async function importWindshift(
  actor: Actor,
  exp: WsExport,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  let report!: ImportReport;
  try {
    await db.transaction(async (tx) => {
      report = await plan(tx, exp);
      if (dryRun || report.errors.length) throw new Rollback();
      for (const row of report.rows) {
        const task = await insertTask(tx, actor, row.data, {
          silent: true,
          events: [
            { type: "imported", payload: { source: SOURCE, sourceId: row.sourceId, key: row.key } },
          ],
        });
        await tx
          .insert(taskImports)
          .values({ taskId: task.id, source: SOURCE, sourceId: row.sourceId });
      }
      report.imported = report.rows.length;
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return report;
}
