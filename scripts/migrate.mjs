// Aplica as migrações no start do container (copiado para dist/migrate.mjs no Dockerfile).
// Usa o migrator do drizzle-orm: o standalone não copia o node_modules/.bin do drizzle-kit.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const db = drizzle(process.env.DATABASE_URL);
await migrate(db, { migrationsFolder: "drizzle" });
await db.$client.end();
console.log("migrations applied");
