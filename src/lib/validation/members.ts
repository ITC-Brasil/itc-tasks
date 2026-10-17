import { z } from "zod";

export const roleSchema = z.enum(["admin", "member"]);

export const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  password: z.string().min(12, "A senha precisa de 12 caracteres ou mais").max(128),
  role: roleSchema,
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const memberIdSchema = z.string().min(1);
