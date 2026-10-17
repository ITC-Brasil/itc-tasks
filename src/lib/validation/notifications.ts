import { z } from "zod";
import { NOTIFICATION_EVENTS } from "@/lib/notifications";

// ADR-050
export const notificationPreferencesSchema = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
export const quietHoursSchema = z
  .object({ quietHoursStart: hhmm, quietHoursEnd: hhmm, emailDigest: z.boolean() })
  .refine((v) => v.quietHoursStart !== v.quietHoursEnd, "Início e fim iguais");

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).optional(),
});

export const markReadSchema = z.array(z.uuid()).max(500).optional();
