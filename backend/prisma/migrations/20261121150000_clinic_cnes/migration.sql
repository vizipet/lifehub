-- CNES: todo estabelecimento de saúde no Brasil tem este número (7 dígitos).
-- O admin confere no site do DATASUS antes de aprovar o local.
ALTER TABLE "clinics" ADD COLUMN "cnes" VARCHAR(7);
CREATE UNIQUE INDEX "clinics_cnes_key" ON "clinics"("cnes");
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_cnes_format" CHECK ("cnes" IS NULL OR "cnes" ~ '^[0-9]{7}$');
