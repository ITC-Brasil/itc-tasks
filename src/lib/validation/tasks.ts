import { z } from "zod";

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_REQUIRED = "Escolha um Projeto/Cliente para criar a tarefa.";

const uuid = z.uuid();
// campo opcional de formulário: vazio vira null
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable()).optional();

const title = z.string().trim().min(1, "Informe o título").max(200, "Até 200 caracteres");
// ADR-045: vários Projetos/Clientes (o primeiro é o principal) e várias UMs; sem repetição
const uniqueIds = (max: number) =>
  z
    .array(uuid)
    .max(max)
    .transform((ids) => [...new Set(ids)]);
const projectIds = z
  .preprocess(
    (v) => v ?? [],
    z.array(z.uuid(PROJECT_REQUIRED)).min(1, PROJECT_REQUIRED).max(10, "Até 10 Projetos/Clientes"),
  )
  .transform((ids) => [...new Set(ids)]);
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
  statusId: optional(uuid),
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: optional(z.string().min(1)),
  mobileUnitIds: uniqueIds(20).default([]),
  glpiTicket: optional(glpiTicket),
  dueDate: optional(dueDate),
  descriptionJson: optional(descriptionJson),
  labelIds: z.array(uuid).max(20).default([]),
};

export const createTaskSchema = z.object({
  ...fields,
  projectIds,
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

// só os campos enviados mudam; projectIds presente tem ao menos um (API.md › update_task)
export const updateTaskSchema = z
  .object({
    ...fields,
    projectIds: z
      .array(uuid)
      .min(1, "A tarefa precisa de pelo menos um Projeto/Cliente")
      .max(10, "Até 10 Projetos/Clientes")
      .transform((ids) => [...new Set(ids)]),
    mobileUnitIds: uniqueIds(20),
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

// ── Filtros das visões (ADR-046) ────────────────────────────────────
// nome do parâmetro na URL → campo; valor repetido = "qualquer um de"
export const FILTER_PARAMS = {
  status: "statusIds",
  responsavel: "assigneeIds",
  projeto: "projectIds",
  um: "mobileUnitIds",
  prioridade: "priorities",
  etiqueta: "labelIds",
} as const;
const many = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(item).max(50))
    .default([]);
export const taskFiltersSchema = z.object({
  statusIds: many(uuid),
  assigneeIds: many(z.string().min(1).max(64)),
  projectIds: many(uuid),
  mobileUnitIds: many(uuid),
  priorities: many(z.enum(PRIORITIES)),
  labelIds: many(uuid),
});
export type TaskFilters = z.output<typeof taskFiltersSchema>;

/** searchParams do Next (ou URLSearchParams) → filtros; parâmetro inválido é ignorado. */
export function parseTaskFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): TaskFilters {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.getAll(k) : Reflect.get(params, k);
  const out = taskFiltersSchema.parse({});
  for (const [param, field] of Object.entries(FILTER_PARAMS)) {
    const parsed = (Reflect.get(taskFiltersSchema.shape, field) as z.ZodType).safeParse(get(param));
    if (parsed.success) Object.assign(out, { [field]: parsed.data });
  }
  return out;
}

/** Filtros → query string, na ordem fixa de FILTER_PARAMS (compara filtros salvos). */
export function filtersQuery(filters: Partial<TaskFilters>) {
  const q = new URLSearchParams();
  for (const [param, field] of Object.entries(FILTER_PARAMS))
    for (const v of Reflect.get(filters, field) ?? []) q.append(param, v);
  return q.toString();
}

export const VIEWS = ["kanban", "list", "calendar"] as const;
export const savedFilterSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Até 60 caracteres"),
  view: z.enum(VIEWS),
  filters: taskFiltersSchema,
});

// ── Comentários (ADR-048) ───────────────────────────────────────────
export const commentBodySchema = descriptionJson;
export type CommentBody = z.infer<typeof commentBodySchema>;
