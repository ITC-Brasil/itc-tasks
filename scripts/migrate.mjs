// Aplica as migrações no start do container (copiado para dist/migrate.mjs no Dockerfile).
// Usa o migrator do drizzle-orm: o standalone não copia o node_modules/.bin do drizzle-kit.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const db = drizzle(process.env.DATABASE_URL);
await migrate(db, { migrationsFolder: "drizzle" });
// ADR-067: o status "Aguardando" não cabe no .sql (valor novo de enum não pode ser usado na
// transação do ADD VALUE). Idempotente; mesmo SQL de src/db/seed.mjs.
await db.$client.query(
  `WITH slot AS (
     SELECT min(position) AS p FROM workflow_statuses
     WHERE category = 'done'
       AND NOT EXISTS (SELECT 1 FROM workflow_statuses WHERE category = 'waiting')
   ), shifted AS (
     UPDATE workflow_statuses w SET position = w.position + 1
     FROM slot WHERE w.position >= slot.p
   )
   INSERT INTO workflow_statuses (name, category, position)
   SELECT 'Aguardando', 'waiting', p FROM slot WHERE p IS NOT NULL`,
);
await db.$client.end();
console.log("migrations applied");
