ALTER TYPE "AppointmentStatus" ADD VALUE 'CANCELLED_AUTOMATICALLY';
ALTER TABLE "appointments" ADD COLUMN "attendance_recorded_at" TIMESTAMPTZ(6);
