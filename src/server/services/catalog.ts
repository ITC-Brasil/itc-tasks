import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db";
import { labels, mobileUnits, projects, user, workflowStatuses } from "@/db/schema";
import {
  type LabelInput,
  type MobileUnitInput,
  type ProjectInput,
  type StatusInput,
  labelSchema,
  mobileUnitSchema,
  projectSchema,
  statusNameSchema,
  statusSchema,
} from "@/lib/validation/catalog";
import { type Actor, assertAdmin } from "@/server/actor";

// Cadastros (ADR-018): leitura para qualquer actor, escrita só admin, nunca excluídos
export class CatalogError extends Error {}

type ListOptions = { includeArchived?: boolean };

function found<T>(row: T | undefined, what: string): T {
  if (!row) throw new CatalogError(`${what} não encontrado`);
  return row;
}

/** 23505 (unique_violation) do Postgres vira mensagem para a tela; o Drizzle embrulha em `cause`. */
async function unique<T>(fn: () => Promise<T>, message: string) {
  try {
    return await fn();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") throw new CatalogError(message);
    throw error;
  }
}

const archivedAt = (archived: boolean) => (archived ? new Date() : null);

// ── Projetos/Clientes ───────────────────────────────────────────────

export async function listProjects(_actor: Actor, { includeArchived }: ListOptions = {}) {
  return db
    .select()
    .from(projects)
    .where(includeArchived ? undefined : isNull(projects.archivedAt))
    .orderBy(asc(projects.name));
}

async function assertAssignee(id: string | null) {
  if (!id) return;
  const [row] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, id));
  if (!row || row.banned) throw new CatalogError("Responsável padrão inválido");
}

const duplicateCode = (code: string) => `Já existe um Projeto/Cliente com a sigla ${code}`;

export async function createProject(actor: Actor, input: ProjectInput) {
  assertAdmin(actor);
  const data = projectSchema.parse(input);
  await assertAssignee(data.defaultAssigneeId);
  const [row] = await unique(
    () => db.insert(projects).values(data).returning(),
    duplicateCode(data.code),
  );
  return row;
}

export async function updateProject(actor: Actor, id: string, input: ProjectInput) {
  assertAdmin(actor);
  const data = projectSchema.parse(input);
  await assertAssignee(data.defaultAssigneeId);
  const [row] = await unique(
    () => db.update(projects).set(data).where(eq(projects.id, id)).returning(),
    duplicateCode(data.code),
  );
  return found(row, "Projeto/Cliente");
}

export async function setProjectArchived(actor: Actor, id: string, archived: boolean) {
  assertAdmin(actor);
  const [row] = await db
    .update(projects)
    .set({ archivedAt: archivedAt(archived) })
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  found(row, "Projeto/Cliente");
}

// ── Unidades Móveis ─────────────────────────────────────────────────

export async function listMobileUnits(_actor: Actor, { includeArchived }: ListOptions = {}) {
  return db
    .select({
      id: mobileUnits.id,
      code: mobileUnits.code,
      model: mobileUnits.model,
      plate: mobileUnits.plate,
      base: mobileUnits.base,
      projectId: mobileUnits.projectId,
      projectName: projects.name,
      archivedAt: mobileUnits.archivedAt,
    })
    .from(mobileUnits)
    .leftJoin(projects, eq(projects.id, mobileUnits.projectId))
    .where(includeArchived ? undefined : isNull(mobileUnits.archivedAt))
    .orderBy(asc(mobileUnits.code));
}

/** Cliente novo da UM precisa estar ativo (FLOWS §9); o atual pode ficar mesmo arquivado. */
async function assertClient(projectId: string | null, currentId?: string | null) {
  if (!projectId || projectId === currentId) return;
  const [row] = await db
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (found(row, "Projeto/Cliente").archivedAt) throw new CatalogError("Projeto/Cliente arquivado");
}

const duplicateUnit = (code: string) => `Já existe uma Unidade Móvel com o código ${code}`;

export async function createMobileUnit(actor: Actor, input: MobileUnitInput) {
  assertAdmin(actor);
  const data = mobileUnitSchema.parse(input);
  await assertClient(data.projectId);
  const [row] = await unique(
    () => db.insert(mobileUnits).values(data).returning(),
    duplicateUnit(data.code),
  );
  return row;
}

export async function updateMobileUnit(actor: Actor, id: string, input: MobileUnitInput) {
  assertAdmin(actor);
  const data = mobileUnitSchema.parse(input);
  const [current] = await db
    .select({ projectId: mobileUnits.projectId })
    .from(mobileUnits)
    .where(eq(mobileUnits.id, id));
  await assertClient(data.projectId, found(current, "Unidade Móvel").projectId);
  const [row] = await unique(
    () => db.update(mobileUnits).set(data).where(eq(mobileUnits.id, id)).returning(),
    duplicateUnit(data.code),
  );
  return found(row, "Unidade Móvel");
}

export async function setMobileUnitArchived(actor: Actor, id: string, archived: boolean) {
  assertAdmin(actor);
  const [row] = await db
    .update(mobileUnits)
    .set({ archivedAt: archivedAt(archived) })
    .where(eq(mobileUnits.id, id))
    .returning({ id: mobileUnits.id });
  found(row, "Unidade Móvel");
}

// ── Etiquetas ───────────────────────────────────────────────────────

export async function listLabels(_actor: Actor, { includeArchived }: ListOptions = {}) {
  return db
    .select()
    .from(labels)
    .where(includeArchived ? undefined : isNull(labels.archivedAt))
    .orderBy(asc(labels.name));
}

const duplicateLabel = (name: string) => `Já existe a etiqueta ${name}`;

export async function createLabel(actor: Actor, input: LabelInput) {
  assertAdmin(actor);
  const data = labelSchema.parse(input);
  const [row] = await unique(
    () => db.insert(labels).values(data).returning(),
    duplicateLabel(data.name),
  );
  return row;
}

export async function updateLabel(actor: Actor, id: string, input: LabelInput) {
  assertAdmin(actor);
  const data = labelSchema.parse(input);
  const [row] = await unique(
    () => db.update(labels).set(data).where(eq(labels.id, id)).returning(),
    duplicateLabel(data.name),
  );
  return found(row, "Etiqueta");
}

export async function setLabelArchived(actor: Actor, id: string, archived: boolean) {
  assertAdmin(actor);
  const [row] = await db
    .update(labels)
    .set({ archivedAt: archivedAt(archived) })
    .where(eq(labels.id, id))
    .returning({ id: labels.id });
  found(row, "Etiqueta");
}

// ── Workflow (ADR-022: categoria fixa por status) ───────────────────

export async function listStatuses(_actor: Actor, { includeArchived }: ListOptions = {}) {
  return db
    .select()
    .from(workflowStatuses)
    .where(includeArchived ? undefined : isNull(workflowStatuses.archivedAt))
    .orderBy(asc(workflowStatuses.position));
}

export async function createStatus(actor: Actor, input: StatusInput) {
  assertAdmin(actor);
  const data = statusSchema.parse(input);
  // ponytail: posição por max+1; dois admins criando ao mesmo tempo podem empatar (só afeta a ordem)
  const [{ last }] = await db
    .select({ last: max(workflowStatuses.position) })
    .from(workflowStatuses);
  const [row] = await db
    .insert(workflowStatuses)
    .values({ ...data, position: (last ?? 0) + 1 })
    .returning();
  return row;
}

/** Só o nome muda: trocar a categoria mudaria o sentido das tarefas já no status. */
export async function renameStatus(actor: Actor, id: string, name: string) {
  assertAdmin(actor);
  const [row] = await db
    .update(workflowStatuses)
    .set({ name: statusNameSchema.parse(name) })
    .where(eq(workflowStatuses.id, id))
    .returning();
  return found(row, "Status");
}

/** Cada categoria mantém ao menos um status ativo: concluir e reabrir (W2) dependem disso. */
export async function setStatusArchived(actor: Actor, id: string, archived: boolean) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.id, id))
      .for("update");
    const status = found(row, "Status");
    if (archived) {
      // trava a categoria inteira: dois arquivamentos simultâneos não esvaziam a categoria
      const active = await tx
        .select({ id: workflowStatuses.id })
        .from(workflowStatuses)
        .where(
          and(eq(workflowStatuses.category, status.category), isNull(workflowStatuses.archivedAt)),
        )
        .for("update");
      if (!active.some((s) => s.id !== id))
        throw new CatalogError("Cada categoria precisa de ao menos um status ativo");
    }
    await tx
      .update(workflowStatuses)
      .set({ archivedAt: archivedAt(archived) })
      .where(eq(workflowStatuses.id, id));
  });
}

/** Troca a posição com o vizinho ativo acima (-1) ou abaixo (+1). */
export async function moveStatus(actor: Actor, id: string, direction: -1 | 1) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const list = await tx
      .select({ id: workflowStatuses.id, position: workflowStatuses.position })
      .from(workflowStatuses)
      .where(isNull(workflowStatuses.archivedAt))
      .orderBy(asc(workflowStatuses.position))
      .for("update");
    const i = list.findIndex((s) => s.id === id);
    if (i === -1) throw new CatalogError("Status não encontrado");
    const other = i + direction >= 0 ? list.at(i + direction) : undefined; // at(-1) seria o último
    if (!other) return;
    await tx
      .update(workflowStatuses)
      .set({ position: other.position })
      .where(eq(workflowStatuses.id, id));
    await tx
      .update(workflowStatuses)
      .set({ position: list.at(i)!.position })
      .where(eq(workflowStatuses.id, other.id));
  });
}
