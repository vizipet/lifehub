-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "cep" VARCHAR(8);

-- CreateTable
CREATE TABLE "clinic_documents" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_documents_storage_path_key" ON "clinic_documents"("storage_path");

-- CreateIndex
CREATE INDEX "clinic_documents_clinic_id_idx" ON "clinic_documents"("clinic_id");

-- AddForeignKey
ALTER TABLE "clinic_documents" ADD CONSTRAINT "clinic_documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_documents" ADD CONSTRAINT "clinic_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CEP sempre com 8 dígitos.
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_cep_format" CHECK ("cep" IS NULL OR "cep" ~ '^[0-9]{8}$');
