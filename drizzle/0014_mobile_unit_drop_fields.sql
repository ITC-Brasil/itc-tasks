-- ADR-066: única exceção à regra de migrações só aditivas. Aborta se houver dado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "mobile_units"
    WHERE coalesce(btrim("model"), '') <> ''
       OR coalesce(btrim("plate"), '') <> ''
       OR coalesce(btrim("base"), '') <> ''
  ) THEN
    RAISE EXCEPTION 'mobile_units tem model, plate ou base preenchido: migração abortada (ADR-066)';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "mobile_units" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "mobile_units" DROP COLUMN "plate";--> statement-breakpoint
ALTER TABLE "mobile_units" DROP COLUMN "base";
