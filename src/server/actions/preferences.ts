"use server";

import { z } from "zod";
import { themeSchema } from "@/lib/validation/preferences";
import { requireActor } from "@/server/actor";
import { setSidebarCollapsed, setTheme } from "@/server/services/preferences";

export async function setThemeAction(theme: string) {
  const actor = await requireActor();
  await setTheme(actor, themeSchema.parse(theme));
}

export async function setSidebarCollapsedAction(collapsed: boolean) {
  const actor = await requireActor();
  await setSidebarCollapsed(actor, z.boolean().parse(collapsed));
}
