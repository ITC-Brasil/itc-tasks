import { z } from "zod";

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_REQUIRED = "Escolha um Projeto/Cliente para criar a tarefa.";

const uuid = z.uuid();
// campo opcional de formulário: vazio vira null
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

const title = z.string().trim().min(1, "Informe o título").max(200, "Até 200 caracteres");
const projectId = z.uuid(PROJECT_REQUIRED);
const glpiTicket = z.coerce
  .number()
  .int("Chamado GLPI é um número inteiro")
  .positive("Chamado GLPI é um número positivo")
  .max(9_999_999, "Chamado GLPI tem até 7 dígitos");
const dueDate = z.iso.date("Data inválida");
// documento Tiptap; o service extrai o texto (ADR-042)
const descriptionJson = z.object({ type: z.literal("doc") }).loose();

const fields = {
  title,
  projectId,
  statusId: optional(uuid),
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: optional(z.string().min(1)),
  mobileUnitId: optional(uuid),
  glpiTicket: optional(glpiTicket),
  dueDate: optional(dueDate),
  descriptionJson: optional(descriptionJson),
  labelIds: z.array(uuid).max(20).default([]),
};

export const createTaskSchema = z.object({
  ...fields,
  projectId: z.preprocess((v) => v ?? "", projectId),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

// só os campos enviados mudam; projectId presente nunca é null (API.md › update_task)
export const updateTaskSchema = z
  .object({
    ...fields,
    priority: z.enum(PRIORITIES),
    labelIds: z.array(uuid).max(20),
  })
  .partial();
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const bulkUpdateSchema = z.object({
  taskIds: z.array(uuid).min(1).max(200),
  patch: updateTaskSchema.pick({ statusId: true, assigneeId: true, priority: true }),
});

export const moveTaskSchema = z.object({
  statusId: uuid,
  afterTaskId: uuid.nullable(), // null = topo da coluna
});

export const taskIdSchema = uuid;
/** "TI-142", "142" ou 142 (ADR-021). */
export const taskNumberSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(TI-)?\d+$/),
  ])
  .transform((v) => Number(String(v).replace("TI-", "")))
  .pipe(z.number().int().positive());

export const checklistTextSchema = z.string().trim().min(1, "Informe o texto").max(200);
export const checklistItemSchema = z
  .object({ text: checklistTextSchema, done: z.boolean(), assigneeId: optional(z.string()) })
  .partial();

export const LINK_KINDS = ["blocks", "blocked_by", "relates"] as const;
export const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  target: taskNumberSchema,
});

// template de tarefa (Módulo 09): campos que a criação rápida preenche
export const taskTemplatePayloadSchema = z.object({
  title: z.string().max(200).optional(),
  priority: z.enum(PRIORITIES).optional(),
  labelIds: z.array(uuid).optional(),
  checklist: z.array(z.string()).optional(),
  descriptionJson: descriptionJson.optional(),
});
