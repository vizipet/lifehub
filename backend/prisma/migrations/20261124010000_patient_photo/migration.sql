CREATE TABLE "patient_photos" (
  "patient_id" UUID NOT NULL,
  "bytes" BYTEA NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "patient_photos_pkey" PRIMARY KEY ("patient_id"),
  CONSTRAINT "patient_photos_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "patient_photos_size_check" CHECK (octet_length("bytes") BETWEEN 1 AND 262144)
);
