import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { version } from "../../../../package.json";
import { db } from "@/db";

// docs/API.md §6: banco e fila (schema pgboss, criado pelo worker — ADR-050)
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ db: "down", queue: "down", version }, { status: 503 });
  }
  const queue = await db
    .execute(sql`select 1 from pgboss.version`)
    .then(() => "ok" as const)
    .catch(() => "down" as const);
  return Response.json({ db: "ok", queue, version }, { status: queue === "ok" ? 200 : 503 });
}
