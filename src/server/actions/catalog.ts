"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  catalogIdSchema,
  involvedSchema,
  labelSchema,
  mobileUnitSchema,
  projectSchema,
  statusNameSchema,
  statusSchema,
} from "@/lib/validation/catalog";
import { ForbiddenError, requireActor } from "@/server/actor";
import type { ActionResult } from "@/server/actions/members";
import {
  CatalogError,
  createInvolved,
  createLabel,
  createMobileUnit,
  createProject,
  createStatus,
  moveStatus,
  renameStatus,
  setInvolvedArchived,
  setLabelArchived,
  setMobileUnitArchived,
  setProjectArchived,
  setStatusArchived,
  updateInvolved,
  updateLabel,
  updateMobileUnit,
  updateProject,
} from "@/server/services/catalog";

// Só valida, chama o service e mapeia erros (ADR-003); o Zod do conteúdo roda no service
async function run(path: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath(path);
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

const optionalId = catalogIdSchema.nullable();
const fields = (form: FormData) => Object.fromEntries(form);

export async function saveProjectAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run("/config/projetos", () => {
    const projectId = optionalId.parse(id);
    const data = projectSchema.parse(fields(form));
    return projectId ? updateProject(actor, projectId, data) : createProject(actor, data);
  });
}

export async function setProjectArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run("/config/projetos", () =>
    setProjectArchived(actor, catalogIdSchema.parse(id), z.boolean().parse(archived)),
  );
}

export async function saveMobileUnitAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run("/config/unidades", () => {
    const unitId = optionalId.parse(id);
    const data = mobileUnitSchema.parse(fields(form));
    return unitId ? updateMobileUnit(actor, unitId, data) : createMobileUnit(actor, data);
  });
}

export async function setMobileUnitArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run("/config/unidades", () =>
    setMobileUnitArchived(actor, catalogIdSchema.parse(id), z.boolean().parse(archived)),
  );
}

export async function saveLabelAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run("/config/etiquetas", () => {
    const labelId = optionalId.parse(id);
    const data = labelSchema.parse(fields(form));
    return labelId ? updateLabel(actor, labelId, data) : createLabel(actor, data);
  });
}

export async function setLabelArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run("/config/etiquetas", () =>
    setLabelArchived(actor, catalogIdSchema.parse(id), z.boolean().parse(archived)),
  );
}

export async function saveInvolvedAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run("/config/envolvidos", () => {
    const involvedId = optionalId.parse(id);
    const data = involvedSchema.parse(fields(form));
    return involvedId ? updateInvolved(actor, involvedId, data) : createInvolved(actor, data);
  });
}

export async function setInvolvedArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run("/config/envolvidos", () =>
    setInvolvedArchived(actor, catalogIdSchema.parse(id), z.boolean().parse(archived)),
  );
}

export async function saveStatusAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run("/config/workflow", () => {
    const statusId = optionalId.parse(id);
    const data = fields(form);
    return statusId
      ? renameStatus(actor, statusId, statusNameSchema.parse(data.name))
      : createStatus(actor, statusSchema.parse(data));
  });
}

export async function setStatusArchivedAction(id: string, archived: boolean) {
  const actor = await requireActor();
  return run("/config/workflow", () =>
    setStatusArchived(actor, catalogIdSchema.parse(id), z.boolean().parse(archived)),
  );
}

export async function moveStatusAction(id: string, direction: number) {
  const actor = await requireActor();
  return run("/config/workflow", () =>
    moveStatus(
      actor,
      catalogIdSchema.parse(id),
      z.union([z.literal(-1), z.literal(1)]).parse(direction),
    ),
  );
}
