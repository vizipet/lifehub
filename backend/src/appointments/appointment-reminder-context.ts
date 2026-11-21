import { AppointmentStatus, AvailabilityStatus, UserRole, UserStatus } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { REMINDER_WINDOW_MS } from '../notifications/appointment-reminder.event';

// Public appointment-domain query shared by notification creation and e-mail.
export async function findDueAppointmentReminder(
  db: Pick<Prisma.TransactionClient, 'appointment'>,
  appointmentId: string,
  now: Date,
) {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, holderId: true, status: true,
      serviceNameSnapshot: true, professionalNameSnapshot: true, clinicNameSnapshot: true,
      slot: { select: { startsAt: true, status: true } },
      holder: { select: {
        role: true, status: true,
        notificationPreference: { select: { appointmentReminders: true } },
      } },
    },
  });
  if (
    !appointment || appointment.status !== AppointmentStatus.CONFIRMED ||
    appointment.slot.status !== AvailabilityStatus.BOOKED ||
    appointment.holder.role !== UserRole.PATIENT || appointment.holder.status !== UserStatus.ACTIVE ||
    appointment.holder.notificationPreference?.appointmentReminders === false ||
    appointment.slot.startsAt.getTime() <= now.getTime() ||
    appointment.slot.startsAt.getTime() > now.getTime() + REMINDER_WINDOW_MS
  ) return null;
  return appointment;
}
