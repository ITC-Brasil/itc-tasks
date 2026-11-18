import { z } from "zod";
import { RECURRENCE_FREQUENCIES } from "@/lib/recurrence";
import {
  PROJECT_REQUIRED,
  VISIBILITIES,
  dueDateSchema,
  dueTimeSchema,
  optionalField,
  recurrencePayloadSchema,
} from "./tasks";

// ADR-077: regra de recorrência; os campos que não são da frequência escolhida viram null
export const recurrenceSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(100, "Até 100 caracteres"),
    visibility: z.enum(VISIBILITIES).default("team"),
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    monthDay: z.number().int().min(0).max(31).nullable().default(null), // 0 = último dia
    intervalMonths: z.number().int().min(1).max(12).default(1),
    startDate: dueDateSchema,
    dueInDays: z.number().int().min(0, "De 0 a 60 dias").max(60, "De 0 a 60 dias").default(0),
    dueTime: optionalField(dueTimeSchema),
    payload: recurrencePayloadSchema,
  })
  .superRefine((d, ctx) => {
    if (d.frequency === "weekly" && d.weekdays.length === 0)
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Escolha os dias da semana" });
    if (d.frequency === "monthly" && d.monthDay === null)
      ctx.addIssue({ code: "custom", path: ["monthDay"], message: "Escolha o dia do mês" });
    if (d.visibility === "team" && d.payload.projectIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["payload", "projectIds"], message: PROJECT_REQUIRED });
  })
  .transform((d) => ({
    ...d,
    weekdays: d.frequency === "weekly" ? [...new Set(d.weekdays)].sort() : null,
    monthDay: d.frequency === "monthly" ? d.monthDay : null,
    intervalMonths: d.frequency === "monthly" ? d.intervalMonths : 1,
    dueTime: d.dueTime ?? null,
  }));
export type RecurrenceInput = z.input<typeof recurrenceSchema>;
