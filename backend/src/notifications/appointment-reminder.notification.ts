import { findDueAppointmentReminder } from '../appointments/appointment-reminder-context';
import type { PrismaService } from '../common/prisma/prisma.service';
import { APPOINTMENT_REMINDER_24H, reminderKey } from './appointment-reminder.event';
import { NotificationSkippedError } from './notification-skipped.error';

export async function createAppointmentReminderNotification(prisma: PrismaService, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !('appointmentId' in payload) || typeof payload.appointmentId !== 'string') {
    throw new Error('INVALID_REMINDER_PAYLOAD');
  }
  const deduplicationKey = reminderKey(payload.appointmentId);
  const appointment = await findDueAppointmentReminder(prisma, payload.appointmentId, new Date());
  if (!appointment) throw new NotificationSkippedError();
  try {
    return await prisma.notification.upsert({
      where: { deduplicationKey }, update: {},
      create: {
        userId: appointment.holderId,
        type: APPOINTMENT_REMINDER_24H,
        title: 'Lembrete de consulta',
        message: `Sua consulta de ${appointment.serviceNameSnapshot} com ` +
          `${appointment.professionalNameSnapshot} em ${appointment.clinicNameSnapshot} ` +
          `está marcada para ${appointment.slot.startsAt.toISOString()} (UTC).`,
        deduplicationKey,
      },
    });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;
    return prisma.notification.findUniqueOrThrow({ where: { deduplicationKey } });
  }
}
