import { tmpdir } from "node:os";
import path from "node:path";
import { testDatabaseUrl } from "./test-db";

// src/db usa DATABASE_URL: aponta para o banco de teste antes de qualquer import
process.env.DATABASE_URL = testDatabaseUrl();
// anexos dos testes fora do volume de produção (o CI não tem /data)
process.env.UPLOADS_DIR = path.join(tmpdir(), "itc-tasks-test-uploads");
