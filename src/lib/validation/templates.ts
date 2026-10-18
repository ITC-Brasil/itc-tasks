import { z } from "zod";
import { PROJECT_REQUIRED, taskTemplatePayloadSchema } from "./tasks";

// ADR-052: template de tarefa (uma tarefa com subtarefas) e de projeto (várias tarefas)

export const projectTemplatePayloadSchema = z.object({
  tasks: z
    .array(taskTemplatePayloadSchema.extend({ title: z.string().trim().min(1).max(200) }))
    .min(1, "Inclua pelo menos uma tarefa")
    .max(30, "Até 30 tarefas"),
});
export type ProjectTemplatePayload = z.infer<typeof projectTemplatePayloadSchema>;

const name = z.string().trim().min(1, "Informe o nome").max(80, "Até 80 caracteres");

export const templateSchema = z.discriminatedUnion("kind", [
  z.object({ name, kind: z.literal("task"), payload: taskTemplatePayloadSchema }),
  z.object({ name, kind: z.literal("project"), payload: projectTemplatePayloadSchema }),
]);
export type TemplateInput = z.input<typeof templateSchema>;

/** Template de projeto: as tarefas vão para estes Projetos/Clientes e UMs. */
export const useProjectTemplateSchema = z.object({
  projectIds: z.array(z.uuid(PROJECT_REQUIRED)).min(1, PROJECT_REQUIRED).max(10),
  mobileUnitIds: z.array(z.uuid()).max(20).default([]),
});

/**
 * Texto da tela ↔ tarefas do template de projeto: cada linha é uma tarefa; linha que começa com
 * "-" é subtarefa da tarefa de cima.
 */
export function parseTaskOutline(text: string) {
  const tasks: { title: string; checklist: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("-")) {
      const item = line.slice(1).trim();
      if (item && tasks.length) tasks.at(-1)!.checklist.push(item);
    } else tasks.push({ title: line, checklist: [] });
  }
  return tasks;
}

export const formatTaskOutline = (tasks: { title: string; checklist?: string[] }[]) =>
  tasks.map((t) => [t.title, ...(t.checklist ?? []).map((c) => `- ${c}`)].join("\n")).join("\n");
