import { type SQL, sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import type { Tx } from "@/server/services/tasks";
import { env } from "@/lib/env";

// ADR-050/052: filas do worker; o processo web só envia
export const QUEUES = {
  fanout: "notification.fanout",
  push: "notification.push",
  daily: "daily.morning",
  evaluate: "automation.evaluate",
  overdue: "automation.overdue",
  recurrence: "recurrence.daily", // ADR-077
} as const;

export const NO_RETRY = new Set<string>([QUEUES.evaluate, QUEUES.overdue]);

export type FanoutJob = { eventIds: string[] };
export type PushJob = { notificationId: string };

const holder = globalThis as { __boss?: Promise<PgBoss>; __queues?: string };

/** PgBoss só para enviar (sem manutenção nem cron). Cria schema e filas se o worker ainda não rodou. */
async function sender() {
  holder.__boss ??= (async () => {
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      max: 2,
      supervise: false,
      schedule: false,
    });
    await boss.start();
    return boss;
  })();
  holder.__boss.catch(() => (holder.__boss = undefined)); // banco fora: tenta de novo na próxima
  const boss = await holder.__boss;
  // o PgBoss vive em globalThis (HMR): fila nova de outro módulo também precisa existir
  const names = Object.values(QUEUES);
  if (holder.__queues !== names.join()) {
    for (const name of names) await boss.createQueue(name);
    holder.__queues = names.join();
  }
  return boss;
}

/** `$1, $2…` do pg-boss → parâmetros do Drizzle, para rodar dentro da transação. */
export function toSql(text: string, values: unknown[] = []): SQL {
  const parts = text.split(/\$(\d+)/);
  const chunks: SQL[] = [];
  parts.forEach((part, i) => {
    chunks.push(i % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`);
  });
  return sql.join(chunks);
}

/** Enfileira na mesma transação: rollback da escrita = job não existe. */
export async function enqueue(tx: Tx, name: string, data: object) {
  const boss = await sender();
  await boss.send(name, data, {
    // M-053: retry repetiria ações já feitas (avisos, comentários); automação falha uma vez só
    ...(NO_RETRY.has(name) && { retryLimit: 0 }),
    db: {
      executeSql: async (text, values) => ({ rows: (await tx.execute(toSql(text, values))).rows }),
    },
  });
}
