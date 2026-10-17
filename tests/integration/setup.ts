import { testDatabaseUrl } from "./test-db";

// src/db usa DATABASE_URL: aponta para o banco de teste antes de qualquer import
process.env.DATABASE_URL = testDatabaseUrl();
