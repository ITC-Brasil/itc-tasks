import { z } from "zod";
import { STATUS_CATEGORIES } from "./catalog";
import { PRIORITIES, WAITING_NOTE_NEEDED, WAITING_REASONS } from "./tasks";

// ADR-052: regras "Quando → Se → Então"
export const AUTOMATION_TRIGGERS = [
  "task.created",
  "task.status_changed",
  "task.assigned",
  "task.priority_changed",
  "task.overdue",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/** Todas precisam bater, sobre a tarefa no momento da avaliação. */
export const automationConditionsSchema = z
  .object({
    statusCategory: z.enum(STATUS_CATEGORIES),
    priority: z.enum(PRIORITIES),
    hasGlpi: z.boolean(),
    hasMobileUnit: z.boolean(),
  })
  .partial();
export type AutomationConditions = z.infer<typeof automationConditionsSchema>;

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notify"), to: z.enum(["creator", "assignee", "team"]) }),
  z.object({
    type: z.literal("setStatus"),
    statusId: z.uuid("Escolha o status"),
    // ADR-080: só quando o destino é da categoria `waiting`
    waiting: z
      .object({
        reason: z.enum(WAITING_REASONS),
        note: z.string().trim().max(120, "Até 120 caracteres").optional(),
        inDays: z.number().int().min(0, "De 0 a 60 dias").max(60, "De 0 a 60 dias"),
      })
      .refine((w) => w.reason !== "other" || !!w.note, {
        message: WAITING_NOTE_NEEDED,
        path: ["note"],
      })
      .optional(),
  }),
  z.object({ type: z.literal("moveToActiveCycle") }),
  z.object({ type: z.literal("moveToTop") }),
  z.object({ type: z.literal("addLabel"), labelId: z.uuid("Escolha a etiqueta") }),
  z.object({
    type: z.literal("comment"),
    text: z.string().trim().min(1, "Escreva o comentário").max(2000),
  }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationActionsSchema = z
  .array(automationActionSchema)
  .min(1, "Inclua pelo menos uma ação")
  .max(10);

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80, "Até 80 caracteres"),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: automationConditionsSchema,
  actions: automationActionsSchema,
});
export type AutomationRuleInput = z.input<typeof automationRuleSchema>;

/** Job automation.evaluate: eventos de uma escrita e a profundidade da cadeia. */
export type EvaluateJob = { eventIds: string[]; depth: number };
export const MAX_DEPTH = 3;

/** Gatilho que um task_event dispara (o `task.overdue` vem do job da virada do dia). */
export function triggerOf(e: { type: string; payload?: unknown }): AutomationTrigger | null {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (e.type === "created") return "task.created";
  if (e.type === "status_changed") return "task.status_changed";
  if (e.type === "assigned" && p.to) return "task.assigned";
  if (e.type === "field_changed" && p.field === "priority") return "task.priority_changed";
  return null;
}
