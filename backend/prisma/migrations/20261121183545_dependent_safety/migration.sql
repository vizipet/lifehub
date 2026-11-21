-- CreateEnum
CREATE TYPE "DependentCheckResult" AS ENUM ('CONFIRMED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "SafetyAlertKind" AS ENUM ('LINK_MISMATCH', 'DUPLICATE_CPF', 'MANY_MINORS');

-- CreateEnum
CREATE TYPE "SafetyAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "dependent_check_result" "DependentCheckResult",
ADD COLUMN     "dependent_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "dependent_checked_by_id" UUID;

-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" UUID NOT NULL,
    "kind" "SafetyAlertKind" NOT NULL,
    "status" "SafetyAlertStatus" NOT NULL DEFAULT 'OPEN',
    "holder_id" UUID NOT NULL,
    "patient_id" UUID,
    "appointment_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolution" VARCHAR(2000),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safety_alerts_status_created_at_idx" ON "safety_alerts"("status", "created_at");

-- CreateIndex
CREATE INDEX "safety_alerts_holder_id_idx" ON "safety_alerts"("holder_id");

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
