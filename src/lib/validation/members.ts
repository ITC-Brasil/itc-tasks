import { z } from "zod";

export const roleSchema = z.enum(["admin", "member"]);

export const passwordSchema = z
  .string()
  .min(12, "A senha precisa de 12 caracteres ou mais")
  .max(128);

export const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  password: passwordSchema,
  role: roleSchema,
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const memberIdSchema = z.string().min(1);

// M-087: nome de exibição editável; as iniciais saem dele (src/lib/initials.ts)
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome")
  .max(80, "Use até 80 caracteres");
