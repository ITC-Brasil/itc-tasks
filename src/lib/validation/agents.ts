import { z } from "zod";
import { STATUS_CATEGORIES } from "./catalog";
import { DUE_TIME_RE, PRIORITIES, VISIBILITIES, taskNumberSchema } from "./tasks";

// ── Tokens (ADR-049) ────────────────────────────────────────────────

export const createAgentKeySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Até 60 caracteres"),
  access: z.enum(["read", "write"]), // write inclui read
  userId: z.string().min(1).optional(), // admin cria para outra pessoa
});

// ── Entradas das ferramentas MCP (docs/API.md §1) ───────────────────
// referências por código legível; o agentsService resolve para IDs
const code = z.string().trim().min(1).max(40);
const date = z.iso.date("Data inválida (YYYY-MM-DD)");

export const mcpTaskId = { id: z.union([z.string(), z.number()]).pipe(taskNumberSchema) };

export const mcpListTasks = {
  query: z.string().max(100).optional(),
  status: z.array(code).max(20).optional(),
  category: z
    .array(z.enum(STATUS_CATEGORIES))
    .optional()
    .describe("waiting = aguardando terceiro; conta como aberta (ADR-067)"),
  project: code.optional(),
  mobileUnit: code.optional(),
  assignee: z.string().max(200).optional().describe("e-mail, 'me' ou 'none'"),
  dueBefore: date.optional(),
  overdue: z.boolean().optional(),
  visibility: z
    .enum(["team", "personal", "all"])
    .optional()
    .describe("team (padrão) = tarefas da equipe; personal = as pessoais do dono do token; all"),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(20).optional(),
  cycle: z
    .union([z.literal("current"), z.number().int().positive()])
    .optional()
    .describe("'current' (ciclo ativo) ou o número do ciclo"),
};

const taskFields = {
  title: z.string().max(200),
  // opcional aqui para o service responder VALIDATION com a mensagem do produto (API.md)
  projectIds: z
    .array(code)
    .max(10)
    .optional()
    .describe("códigos, ex. ['TRL']; o primeiro é o principal"),
  description: z.string().max(20_000).optional().describe("markdown"),
  status: code.optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().max(200).nullable().optional().describe("e-mail, 'me' ou null"),
  mobileUnitIds: z.array(code).max(20).optional(),
  glpiTicket: z.number().int().positive().max(9_999_999).nullable().optional(),
  dueDate: date.nullable().optional(),
  dueTime: z
    .string()
    .regex(DUE_TIME_RE, "HH:MM")
    .nullable()
    .optional()
    .describe("hora do prazo em Brasília, HH:MM; exige dueDate; null limpa"),
  labels: z.array(code).max(20).optional(),
  involvedIds: z
    .array(z.uuid())
    .max(20)
    .optional()
    .describe("ids de list_involved; a lista substitui a atual ([] limpa)"),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  cycle: z
    .union([z.literal("current"), z.number().int().positive()])
    .optional()
    .describe("'current' (ciclo ativo) ou o número do ciclo"),
};

export const mcpCreateTask = {
  ...taskFields,
  visibility: z
    .enum(VISIBILITIES)
    .optional()
    .describe("personal = só o dono do token vê; projectIds vira opcional (padrão team)"),
};
export const mcpUpdateTask = {
  ...mcpTaskId,
  ...taskFields,
  title: taskFields.title.optional(),
  visibility: z
    .literal("team")
    .optional()
    .describe("move a tarefa pessoal para a equipe (exige Projeto/Cliente); o inverso não existe"),
  checklistToggle: z
    .array(z.object({ index: z.number().int().min(0), done: z.boolean() }))
    .max(50)
    .optional(),
  checklistDue: z
    .array(
      z.object({
        index: z.number().int().min(0),
        dueDate: date.nullable(),
        dueTime: z.string().regex(DUE_TIME_RE, "HH:MM").nullable().optional(),
      }),
    )
    .max(50)
    .optional()
    .describe("prazo da subtarefa pelo índice; null limpa"),
};
export const mcpCompleteTask = { ...mcpTaskId, comment: z.string().max(10_000).optional() };
export const mcpAddComment = { ...mcpTaskId, body: z.string().min(1).max(10_000) };
export const mcpListMobileUnits = { project: code.optional() };
export const mcpListCycles = { state: z.enum(["planned", "active", "closed"]).optional() };

type Shape<T extends z.ZodRawShape> = z.output<z.ZodObject<T>>;
export type McpListTasks = Shape<typeof mcpListTasks>;
export type McpCreateTask = Shape<typeof mcpCreateTask>;
export type McpUpdateTask = Shape<typeof mcpUpdateTask>;
