import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

// ponytail: só o banco por enquanto; a fila (pg-boss) entra no Módulo 08
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
