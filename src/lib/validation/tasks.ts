import { z } from "zod";

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_REQUIRED = "Escolha um Projeto/Cliente para criar a tarefa.";
// ADR-069: tarefa pessoal só o criador vê; Projeto/Cliente opcional nela
export const VISIBILITIES = ["team", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const PERSONAL_OWNER =
  "Tarefa pessoal é sempre de quem criou: não dá para atribuir a outra pessoa.";
export const PERSONAL_NO_PLANNING = "Tarefa pessoal não entra em ciclo nem em marco.";
export const TEAM_NEEDS_PROJECT =
  "Escolha um Projeto/Cliente antes de mover a tarefa para a equipe.";
export const TASK_NEEDS_PROJECT = "A tarefa precisa de pelo menos um Projeto/Cliente";

// ADR-078: motivo do Aguardando (mesma lista do enum `waiting_reason` do banco)
export const WAITING_REASONS = ["purchase", "supplier", "third_party", "client", "other"] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];
export const WAITING_REASON_LABELS: Record<WaitingReason, string> = {
  purchase: "Compra",
  supplier: "Fornecedor",
  third_party: "Terceiro",
  client: "Cliente",
  other: "Outro",
};
export const waitingReasonLabel = (r: string | null | undefined) =>
  (r && WAITING_REASON_LABELS[r as WaitingReason]) || null;
export const WAITING_NEEDED = "Para Aguardando, informe o motivo e a data prevista";
export const WAITING_NOTE_NEEDED = "Com o motivo “Outro”, descreva em até 120 caracteres";
export const WAITING_PAST = "A data prevista é hoje ou uma data futura";
export const WAITING_ONLY = "Motivo e previsão só valem para tarefa em Aguardando";

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
    // o mínimo de um (tarefa da equipe) é conferido no createTaskSchema, que conhece a visibilidade
    z.array(z.uuid(PROJECT_REQUIRED)).max(10, "Até 10 Projetos/Clientes"),
  )
  .transform((ids) => [...new Set(ids)]);
const glpiTicket = z.coerce
  .number()
  .int("Chamado GLPI é um número inteiro")
  .positive("Chamado GLPI é um número positivo")
  .max(9_999_999, "Chamado GLPI tem até 7 dígitos");
const dueDate = z.iso.date("Data inválida");
// ADR-072: hora opcional de Brasília, "HH:MM"; só vale com a data
export const DUE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const dueTime = z.string().regex(DUE_TIME_RE, "Hora inválida (HH:MM)");
export const DUE_TIME_NEEDS_DATE = "Defina a data antes da hora";
// documento Tiptap; o service extrai o texto (ADR-042)
// ADR-061: link só com href, sem class/style em attrs; tamanho e profundidade limitados
const MAX_DOC_CHARS = 200_000;
const MAX_DOC_DEPTH = 20;
type DocNode = Record<string, unknown>;
const stripAttrs = (n: DocNode): DocNode => {
  if (!n.attrs || typeof n.attrs !== "object") return n;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _class, style: _style, ...attrs } = n.attrs as DocNode;
  return { ...n, attrs };
};
const cleanMark = (m: unknown): unknown => {
  if (!m || typeof m !== "object") return m;
  const mark = m as DocNode;
  if (mark.type !== "link") return stripAttrs(mark);
  const href = (mark.attrs as DocNode | undefined)?.href;
  return { type: "link", attrs: { href: typeof href === "string" ? href : null } };
};
function normalizeDoc(node: unknown, depth: number): unknown {
  if (!node || typeof node !== "object") return node;
  if (depth > MAX_DOC_DEPTH) throw new Error("depth");
  const out = stripAttrs({ ...(node as DocNode) });
  if (Array.isArray(out.marks)) out.marks = out.marks.map(cleanMark);
  if (Array.isArray(out.content)) out.content = out.content.map((c) => normalizeDoc(c, depth + 1));
  return out;
}
const descriptionJson = z
  .object({ type: z.literal("doc") })
  .loose()
  .refine((d) => JSON.stringify(d).length <= MAX_DOC_CHARS, "Texto muito longo")
  .transform((d, ctx) => {
    try {
      return normalizeDoc(d, 0) as typeof d;
    } catch {
      ctx.addIssue({ code: "custom", message: "Documento muito aninhado" });
      return z.NEVER;
    }
  });

const fields = {
  title,
  statusId: optional(uuid),
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: optional(z.string().min(1)),
  mobileUnitIds: uniqueIds(20).default([]),
  glpiTicket: optional(glpiTicket),
  dueDate: optional(dueDate),
  dueTime: optional(dueTime),
  descriptionJson: optional(descriptionJson),
  labelIds: z.array(uuid).max(20).default([]),
  // ADR-073: envolvidos (não são usuários); a lista enviada substitui a atual
  involvedIds: z.array(uuid).max(20, "Até 20 envolvidos").default([]),
  // ADR-053: ciclo não encerrado; marco aberto de um dos Projetos/Clientes da tarefa
  cycleId: optional(uuid),
  milestoneId: optional(uuid),
  // ADR-078: exigidos pelo service ao entrar no Aguardando
  waitingReason: optional(z.enum(WAITING_REASONS)),
  waitingNote: optional(z.string().trim().max(120, "Até 120 caracteres")),
  waitingUntil: optional(dueDate),
};

export const createTaskSchema = z
  .object({
    ...fields,
    projectIds,
    visibility: z.enum(VISIBILITIES).default("team"),
    checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    // template de tarefa usado: conta o uso e troca `{UM}` no título (ADR-052)
    templateId: uuid.optional(),
  })
  // Projeto/Cliente obrigatório na tarefa da equipe; opcional na pessoal (ADR-069)
  .refine((d) => d.visibility === "personal" || d.projectIds.length > 0, {
    path: ["projectIds"],
    message: PROJECT_REQUIRED,
  });
export type CreateTaskInput = z.input<typeof createTaskSchema>;

// ADR-077: o que a regra de recorrência copia para cada tarefa criada
export const recurrencePayloadSchema = z.object({
  title,
  descriptionJson: fields.descriptionJson,
  priority: fields.priority,
  assigneeId: fields.assigneeId,
  projectIds,
  mobileUnitIds: fields.mobileUnitIds,
  labelIds: fields.labelIds,
  involvedIds: fields.involvedIds,
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});
export type RecurrencePayload = z.output<typeof recurrencePayloadSchema>;
export { dueDate as dueDateSchema, dueTime as dueTimeSchema, optional as optionalField };

// só os campos enviados mudam; na tarefa da equipe, projectIds presente tem ao menos um (o service
// confere, porque depende da visibilidade). `visibility: "team"` converte a pessoal (ADR-069).
export const updateTaskSchema = z
  .object({
    ...fields,
    projectIds: z
      .array(uuid)
      .max(10, "Até 10 Projetos/Clientes")
      .transform((ids) => [...new Set(ids)]),
    visibility: z.literal("team", "Tarefa da equipe não pode virar pessoal"),
    mobileUnitIds: uniqueIds(20),
    priority: z.enum(PRIORITIES),
    labelIds: z.array(uuid).max(20),
    involvedIds: z.array(uuid).max(20, "Até 20 envolvidos"),
  })
  .partial();
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const bulkUpdateSchema = z.object({
  taskIds: z.array(uuid).min(1).max(200),
  patch: updateTaskSchema.pick({
    statusId: true,
    assigneeId: true,
    priority: true,
    cycleId: true,
    waitingReason: true,
    waitingNote: true,
    waitingUntil: true,
  }),
});

export const deleteTasksSchema = z.object({ taskIds: z.array(uuid).min(1).max(200) });

export const moveTaskSchema = z.object({
  statusId: uuid,
  afterTaskId: uuid.nullable(), // null = topo da coluna
  waitingReason: fields.waitingReason,
  waitingNote: fields.waitingNote,
  waitingUntil: fields.waitingUntil,
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
  .object({
    text: checklistTextSchema,
    done: z.boolean(),
    assigneeId: optional(z.string()),
    dueDate: optional(dueDate), // null limpa (e limpa a hora)
    dueTime: optional(dueTime),
  })
  .partial();

export const LINK_KINDS = ["blocks", "blocked_by", "relates"] as const;
export const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  target: taskNumberSchema,
});

// template de tarefa (Módulo 09): campos que a criação rápida preenche
// `{UM}` no título vira o código da UM; `dueInDays` = dias úteis após criar (ADR-052)
export const taskTemplatePayloadSchema = z.object({
  title: z.string().max(200).optional(),
  priority: z.enum(PRIORITIES).optional(),
  labelIds: z.array(uuid).max(20).optional(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  descriptionJson: descriptionJson.optional(),
  dueInDays: z.number().int().min(0).max(60).optional(),
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
  ciclo: "cycleIds",
  envolvido: "involvedIds", // ADR-073
  motivo: "waitingReasons", // ADR-078
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
  cycleIds: many(uuid),
  involvedIds: many(uuid),
  waitingReasons: many(z.enum(WAITING_REASONS)),
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
