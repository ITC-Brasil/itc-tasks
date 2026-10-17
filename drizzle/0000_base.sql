-- Migração customizada base (docs/SCHEMA.md › SQL fora do Drizzle)
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() não é IMMUTABLE; a coluna gerada tasks.search exige uma função imutável
CREATE OR REPLACE FUNCTION unaccent_immutable(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS task_number_seq START 1;
