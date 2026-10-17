import { z } from "zod";

// ADR-013: só claro e escuro
export const themeSchema = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;
