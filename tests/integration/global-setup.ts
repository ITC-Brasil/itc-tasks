import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { testDatabaseUrl } from "./test-db";

export default async function setup() {
  const db = drizzle(testDatabaseUrl());
  await migrate(db, { migrationsFolder: "drizzle" });
  // banco novo (CI): um status ativo por categoria, como o seed; a ordem dos arquivos não importa
  await db.execute(sql`
    INSERT INTO workflow_statuses (name, category, position)
    SELECT c::text, c, row_number() OVER () * 1000
    FROM unnest(enum_range(NULL::status_category)) AS c
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_statuses w WHERE w.category = c AND w.archived_at IS NULL
    )`);
  await db.$client.end();
}
