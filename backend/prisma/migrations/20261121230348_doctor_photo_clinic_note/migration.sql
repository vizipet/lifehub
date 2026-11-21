-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "verification_note" VARCHAR(2000);

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "photo_mime_type" VARCHAR(40),
ADD COLUMN     "photo_storage_path" VARCHAR(300),
ADD COLUMN     "photo_updated_at" TIMESTAMPTZ(6);
