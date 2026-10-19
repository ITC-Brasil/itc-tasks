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

// ADR-060: só push services conhecidos (Chrome/Edge, Safari, Firefox, Edge no Windows)
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^web\.push\.apple\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
];
const isPushService = (endpoint: string) => {
  const url = new URL(endpoint);
  return url.port === "" && PUSH_HOSTS.some((host) => host.test(url.hostname));
};

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .startsWith("https://")
    .max(2000)
    .refine(isPushService, "Serviço de push não suportado"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).optional(),
});

export const markReadSchema = z.array(z.uuid()).max(500).optional();
