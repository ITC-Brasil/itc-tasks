import { z } from "zod";

// ADR-053: ciclos, marcos e painel
const date = z.iso.date("Data inválida");

export const cycleSchema = z
  .object({ startsOn: date, endsOn: date })
  .refine((c) => c.endsOn >= c.startsOn, {
    message: "O fim não pode ser antes do início",
    path: ["endsOn"],
  });
export type CycleInput = z.input<typeof cycleSchema>;

/** Tarefas não concluídas que vão para o próximo ciclo; as demais ficam sem ciclo. */
export const closeCycleSchema = z.object({ carryTaskIds: z.array(z.uuid()).max(1000) });

export const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120, "Até 120 caracteres"),
  description: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().trim().max(2000).nullable().optional(),
  ),
  projectId: z.uuid("Escolha um Projeto/Cliente"),
  dueOn: z.preprocess((v) => (v === "" ? null : v), date.nullable().optional()),
});
export type MilestoneInput = z.input<typeof milestoneSchema>;

export const DASHBOARD_DAYS = [7, 30, 90] as const;
export const dashboardQuerySchema = z.object({
  projectId: z.uuid().optional(),
  days: z.coerce
    .number()
    .refine((d) => (DASHBOARD_DAYS as readonly number[]).includes(d))
    .catch(30),
});
