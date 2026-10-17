// Testes de integração só rodam no banco itc_tasks_test (CLAUDE.md)
export function testDatabaseUrl() {
  try {
    process.loadEnvFile();
  } catch {
    // CI: variáveis vêm do ambiente
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url || new URL(url).pathname !== "/itc_tasks_test") {
    throw new Error("DATABASE_URL_TEST precisa apontar para o banco itc_tasks_test");
  }
  return url;
}
