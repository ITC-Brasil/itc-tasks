import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { version } from "../../../../package.json";
import { db } from "@/db";

// ponytail: só o banco por enquanto; "queue" (pg-boss) entra no Módulo 08 (docs/API.md §6)
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ db: "ok", version });
  } catch {
    return Response.json({ db: "down", version }, { status: 503 });
  }
}
