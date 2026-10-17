import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { db, pool } from "@/db";

afterAll(() => pool.end());

test("base migration: unaccent_immutable and task_number_seq", async () => {
  const { rows } = await db.execute<{ txt: string; seq: string }>(
    sql`select unaccent_immutable('Ação Técnica') as txt, nextval('task_number_seq') as seq`,
  );
  expect(rows[0].txt).toBe("Acao Tecnica");
  expect(Number(rows[0].seq)).toBeGreaterThan(0);
});
