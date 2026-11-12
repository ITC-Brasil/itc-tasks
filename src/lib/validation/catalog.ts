import { z } from "zod";

// campo opcional de formulário: vazio vira null
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const catalogIdSchema = z.uuid();

export const PROJECT_KINDS = ["project", "client", "internal"] as const;

// ADR-068: paleta fechada; o banco guarda a chave, nunca hex. Tokens --project-<chave>-* no globals.css
export const PROJECT_COLORS = [
  "blue",
  "indigo",
  "violet",
  "magenta",
  "rose",
  "brown",
  "olive",
  "slate",
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export const PROJECT_COLOR_NAMES: Record<ProjectColor, string> = {
  blue: "Azul",
  indigo: "Anil",
  violet: "Violeta",
  magenta: "Magenta",
  rose: "Rosa",
  brown: "Marrom",
  olive: "Oliva",
  slate: "Cinza-azulado",
};

export const projectSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/, "A sigla tem de 2 a 12 letras ou números"), // ADR-044
  name: z.string().trim().min(2, "Informe o nome").max(80),
  kind: z.enum(PROJECT_KINDS),
  // default_assignee_id fica no banco sem uso (ADR-045)
  glpiEntity: optionalText(80),
  // ADR-068: "" (Padrão no formulário) limpa a cor; ausente não mexe
  color: z
    .enum(PROJECT_COLORS)
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
});
export type ProjectInput = z.input<typeof projectSchema>;

export const mobileUnitSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "Informe o código").max(20),
  projectId: z.uuid("Escolha o Projeto/Cliente da Unidade Móvel"), // ADR-044
});
export type MobileUnitInput = z.input<typeof mobileUnitSchema>;

// paleta própria (ADR-041), nunca cores funcionais; o banco guarda o nome, nunca hex
export const LABEL_COLORS = [
  "label-teal",
  "label-blue",
  "label-plum",
  "label-rose",
  "label-olive",
  "label-brown",
  "label-slate",
] as const;

export const labelSchema = z.object({
  name: z.string().trim().toLowerCase().min(1, "Informe o nome").max(30),
  colorToken: z.enum(LABEL_COLORS, "Escolha uma cor"),
});
export type LabelInput = z.input<typeof labelSchema>;

export const STATUS_CATEGORIES = ["backlog", "todo", "in_progress", "waiting", "done"] as const; // ADR-022, ADR-067

export const statusNameSchema = z.string().trim().min(1, "Informe o nome").max(40);

export const statusSchema = z.object({
  name: statusNameSchema,
  category: z.enum(STATUS_CATEGORIES),
});
export type StatusInput = z.input<typeof statusSchema>;
