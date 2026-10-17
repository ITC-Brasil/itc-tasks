import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { type FanoutJob, type PushJob, QUEUES } from "@/server/jobs";
import { daily, fanout, pushNotification } from "@/server/services/notifications";

// ADR-010/050: processo separado; cria/migra o schema pgboss e consome as filas
if (env.NODE_ENV === "production") {
  const missing = [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "SMTP_HOST",
    "MAIL_FROM",
  ].filter((k) => !env[k as keyof typeof env]);
  if (missing.length) throw new Error(`worker: faltam ${missing.join(", ")} no .env`);
}

async function startBoss() {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL });
  boss.on("error", (err) => console.error("pg-boss:", err));
  await boss.start();
  for (const name of Object.values(QUEUES)) await boss.createQueue(name);
  return boss;
}

const boss = await startBoss();
await boss.work<FanoutJob>(QUEUES.fanout, async ([job]) => fanout(job.data.eventIds));
await boss.work<PushJob>(QUEUES.push, async ([job]) => pushNotification(job.data.notificationId));
await boss.work(QUEUES.daily, async () => daily());
await boss.schedule(QUEUES.daily, "0 8 * * *", null, { tz: env.APP_TIMEZONE });
console.log("worker: pronto");

for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.once(sig, async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  });
