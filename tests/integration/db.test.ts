import { readFileSync } from "node:fs";
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

// ADR-066: roda o arquivo real da migração sobre uma tabela temporária (pg_temp vem antes de public)
test("0014: recusa o DROP com dado em model, plate ou base; com tudo vazio, remove", async () => {
  const statements = readFileSync("drizzle/0014_mobile_unit_drop_fields.sql", "utf8").split(
    "--> statement-breakpoint",
  );
  const client = await pool.connect();
  const run = async (values: string) => {
    await client.query("BEGIN");
    try {
      await client.query(
        "CREATE TEMP TABLE mobile_units (code text, model text, plate text, base text) ON COMMIT DROP",
      );
      await client.query(`INSERT INTO mobile_units VALUES ${values}`);
      for (const s of statements) await client.query(s);
      const { rows } = await client.query(
        "SELECT attname FROM pg_attribute WHERE attrelid = 'pg_temp.mobile_units'::regclass AND attnum > 0 AND NOT attisdropped",
      );
      return rows.map((r) => r.attname);
    } finally {
      await client.query("ROLLBACK");
    }
  };
  try {
    await expect(
      run("('UM-1', NULL, NULL, NULL), ('UM-2', NULL, 'ABC1D23', NULL)"),
    ).rejects.toThrow("ADR-066");
    await expect(run("('UM-1', NULL, '', '  ')")).resolves.toEqual(["code"]);
  } finally {
    client.release();
  }
});
