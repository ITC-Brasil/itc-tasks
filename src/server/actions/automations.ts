"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AutomationRuleInput } from "@/lib/validation/automations";
import { catalogIdSchema } from "@/lib/validation/catalog";
import { ForbiddenError, requireActor } from "@/server/actor";
import type { ActionResult } from "@/server/actions/members";
import { AutomationError, saveRule, setRuleEnabled } from "@/server/services/automations";

// Só valida, chama o service e mapeia erros (ADR-003); o Zod da regra roda no service
async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/config/automacoes");
    return { ok: true };
  } catch (error) {
    if (error instanceof AutomationError || error instanceof ForbiddenError)
      return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
    throw error;
  }
}

const choice = (v: FormDataEntryValue | null) => (v ? String(v) : undefined);
const yesNo = (v: FormDataEntryValue | null) =>
  v === "yes" ? true : v === "no" ? false : undefined;

export async function saveAutomationRuleAction(id: string | null, form: FormData) {
  const actor = await requireActor();
  return run(() => {
    let actions: unknown;
    try {
      actions = JSON.parse(String(form.get("actions") ?? "[]"));
    } catch {
      throw new AutomationError("Ações inválidas");
    }
    // o formulário manda texto; o Zod do service confere os valores
    const input = {
      name: form.get("name"),
      trigger: form.get("trigger"),
      conditions: {
        statusCategory: choice(form.get("statusCategory")),
        priority: choice(form.get("priority")),
        hasGlpi: yesNo(form.get("hasGlpi")),
        hasMobileUnit: yesNo(form.get("hasMobileUnit")),
      },
      actions,
    } as AutomationRuleInput;
    return saveRule(actor, catalogIdSchema.nullable().parse(id), input);
  });
}

export async function setAutomationRuleEnabledAction(id: string, enabled: boolean) {
  const actor = await requireActor();
  return run(() => setRuleEnabled(actor, catalogIdSchema.parse(id), z.boolean().parse(enabled)));
}
