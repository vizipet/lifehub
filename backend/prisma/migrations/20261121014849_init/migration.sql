-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'PROFESSIONAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'NOT_INFORMED');

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('SELF', 'CHILD', 'SPOUSE', 'PARENT', 'SIBLING', 'GRANDPARENT', 'OTHER');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('IN_PERSON', 'REMOTE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_PROVIDER', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS_OF_USE', 'PRIVACY_POLICY', 'HEALTH_DATA_CONSENT');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCOUNT_DELETION');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('VALID', 'UNREACHABLE', 'OUTDATED', 'NOT_CHECKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cpf_hash" VARCHAR(64) NOT NULL,
    "cpf_encrypted" TEXT NOT NULL,
    "cpf_last2" VARCHAR(2) NOT NULL,
    "birth_date" DATE NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "holder_id" UUID NOT NULL,
    "relationship" "Relationship" NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'NOT_INFORMED',
    "cpf_hash" VARCHAR(64),
    "cpf_encrypted" TEXT,
    "cpf_last2" VARCHAR(2),
    "guardian_consent_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "crm" VARCHAR(10),
    "crm_state" VARCHAR(2),
    "specialty_id" UUID,
    "bio" VARCHAR(600),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "technical_responsible_professional_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_professionals" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "modality" "Modality" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price_cents" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_professionals" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "holder_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "service_name_snapshot" TEXT NOT NULL,
    "service_duration_minutes_snapshot" INTEGER NOT NULL,
    "service_modality_snapshot" "Modality" NOT NULL,
    "service_price_cents_snapshot" INTEGER,
    "professional_name_snapshot" TEXT NOT NULL,
    "clinic_name_snapshot" TEXT NOT NULL,
    "clinic_address_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_type" "LegalDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "appointment_reminders" BOOLEAN NOT NULL DEFAULT true,
    "campaign_updates" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "deduplication_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "email_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "deduplication_key" VARCHAR(200),
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "processing_started_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "reason" VARCHAR(2000),
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_job_leases" (
    "name" VARCHAR(64) NOT NULL,
    "owner_id" UUID,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "internal_job_leases_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "target_audience" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_status" "SourceStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "source_checked_at" TIMESTAMPTZ(6),
    "source_check_failure" VARCHAR(32),
    "source_check_claim_id" UUID,
    "source_check_claim_until" TIMESTAMPTZ(6),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_hash_key" ON "users"("cpf_hash");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "patients_holder_id_idx" ON "patients"("holder_id");

-- CreateIndex
CREATE INDEX "patients_deleted_at_idx" ON "patients"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "patients_holder_id_cpf_hash_key" ON "patients"("holder_id", "cpf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_code_key" ON "specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE INDEX "professionals_verification_status_idx" ON "professionals"("verification_status");

-- CreateIndex
CREATE INDEX "professionals_specialty_id_idx" ON "professionals"("specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_crm_crm_state_key" ON "professionals"("crm", "crm_state");

-- CreateIndex
CREATE INDEX "clinics_verification_status_idx" ON "clinics"("verification_status");

-- CreateIndex
CREATE INDEX "clinics_city_idx" ON "clinics"("city");

-- CreateIndex
CREATE INDEX "clinics_neighborhood_idx" ON "clinics"("neighborhood");

-- CreateIndex
CREATE UNIQUE INDEX "verification_documents_storage_path_key" ON "verification_documents"("storage_path");

-- CreateIndex
CREATE INDEX "verification_documents_professional_id_idx" ON "verification_documents"("professional_id");

-- CreateIndex
CREATE INDEX "clinic_professionals_clinic_id_idx" ON "clinic_professionals"("clinic_id");

-- CreateIndex
CREATE INDEX "clinic_professionals_professional_id_idx" ON "clinic_professionals"("professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_professionals_clinic_id_professional_id_key" ON "clinic_professionals"("clinic_id", "professional_id");

-- CreateIndex
CREATE INDEX "services_clinic_id_idx" ON "services"("clinic_id");

-- CreateIndex
CREATE INDEX "services_is_active_idx" ON "services"("is_active");

-- CreateIndex
CREATE INDEX "services_modality_idx" ON "services"("modality");

-- CreateIndex
CREATE INDEX "service_professionals_service_id_idx" ON "service_professionals"("service_id");

-- CreateIndex
CREATE INDEX "service_professionals_professional_id_idx" ON "service_professionals"("professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_professionals_service_id_professional_id_key" ON "service_professionals"("service_id", "professional_id");

-- CreateIndex
CREATE INDEX "availability_slots_starts_at_idx" ON "availability_slots"("starts_at");

-- CreateIndex
CREATE INDEX "availability_slots_professional_id_starts_at_idx" ON "availability_slots"("professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "availability_slots_clinic_id_starts_at_idx" ON "availability_slots"("clinic_id", "starts_at");

-- CreateIndex
CREATE INDEX "availability_slots_service_id_starts_at_idx" ON "availability_slots"("service_id", "starts_at");

-- CreateIndex
CREATE INDEX "availability_slots_status_starts_at_idx" ON "availability_slots"("status", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_holder_id_idx" ON "appointments"("holder_id");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_service_id_idx" ON "appointments"("service_id");

-- CreateIndex
CREATE INDEX "appointments_professional_id_idx" ON "appointments"("professional_id");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_idx" ON "appointments"("clinic_id");

-- CreateIndex
CREATE INDEX "appointments_slot_id_idx" ON "appointments"("slot_id");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_id_idx" ON "idempotency_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_operation_key_key" ON "idempotency_keys"("user_id", "operation", "key");

-- CreateIndex
CREATE INDEX "legal_acceptances_user_id_idx" ON "legal_acceptances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_user_id_document_type_version_key" ON "legal_acceptances"("user_id", "document_type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_deduplication_key_key" ON "notifications"("deduplication_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "privacy_requests_user_id_idx" ON "privacy_requests"("user_id");

-- CreateIndex
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_deduplication_key_key" ON "outbox_events"("deduplication_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_created_at_idx" ON "outbox_events"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "campaigns_status_starts_at_idx" ON "campaigns"("status", "starts_at");

-- CreateIndex
CREATE INDEX "campaigns_status_ends_at_idx" ON "campaigns"("status", "ends_at");

-- CreateIndex
CREATE INDEX "campaigns_source_status_idx" ON "campaigns"("source_status");

-- CreateIndex
CREATE INDEX "campaigns_status_source_checked_at_idx" ON "campaigns"("status", "source_checked_at");

-- CreateIndex
CREATE INDEX "campaigns_verified_by_id_idx" ON "campaigns"("verified_by_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_technical_responsible_professional_id_fkey" FOREIGN KEY ("technical_responsible_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_professionals" ADD CONSTRAINT "clinic_professionals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_professionals" ADD CONSTRAINT "clinic_professionals_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_professionals" ADD CONSTRAINT "service_professionals_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_professionals" ADD CONSTRAINT "service_professionals_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "availability_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Regras de integridade que o Prisma não expressa no schema
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Horários: início antes do fim e nenhum médico com dois horários sobrepostos.
ALTER TABLE "availability_slots"
  ADD CONSTRAINT "availability_slots_valid_interval" CHECK ("starts_at" < "ends_at");
ALTER TABLE "availability_slots"
  ADD CONSTRAINT "availability_slots_professional_no_overlap"
  EXCLUDE USING GIST (
    "professional_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  );

-- Um horário só pode ter um agendamento confirmado (evita reserva dupla).
CREATE UNIQUE INDEX "appointments_slot_id_confirmed_key"
  ON "appointments"("slot_id")
  WHERE "status" = 'CONFIRMED';

-- Coordenadas válidas e sempre em par.
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_latitude_range"
  CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_longitude_range"
  CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_coordinates_pair"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- Concessão de tarefas internas: dono e prazo andam juntos.
ALTER TABLE "internal_job_leases"
  ADD CONSTRAINT "internal_job_leases_owner_expiry_check"
  CHECK (("owner_id" IS NULL) = ("expires_at" IS NULL));

-- CRM: número só com dígitos e UF com 2 letras maiúsculas.
ALTER TABLE "professionals"
  ADD CONSTRAINT "professionals_crm_format"
  CHECK ("crm" IS NULL OR "crm" ~ '^[0-9]{4,8}$');
ALTER TABLE "professionals"
  ADD CONSTRAINT "professionals_crm_state_format"
  CHECK ("crm_state" IS NULL OR "crm_state" ~ '^[A-Z]{2}$');

-- Paciente: só um registro "SELF" (o próprio titular) por conta.
CREATE UNIQUE INDEX "patients_holder_self_key"
  ON "patients"("holder_id")
  WHERE "relationship" = 'SELF' AND "deleted_at" IS NULL;

-- Dependentes exigem a declaração de responsabilidade do titular.
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_dependent_consent"
  CHECK ("relationship" = 'SELF' OR "guardian_consent_at" IS NOT NULL);

-- Data de nascimento plausível.
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_birth_date_range"
  CHECK ("birth_date" >= DATE '1900-01-01');
ALTER TABLE "users"
  ADD CONSTRAINT "users_birth_date_range"
  CHECK ("birth_date" >= DATE '1900-01-01');
