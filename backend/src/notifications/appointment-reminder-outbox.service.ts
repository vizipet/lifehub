import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { APPOINTMENT_REMINDER_24H, reminderKey } from './appointment-reminder.event';

@Injectable()
export class AppointmentReminderOutboxService {
  async enqueue(tx: Prisma.TransactionClient, appointmentId: string): Promise<number> {
    // PostgreSQL ON CONFLICT DO NOTHING: no exception/aborted transaction on replay.
    const result = await tx.outboxEvent.createMany({
      data: [{
        type: APPOINTMENT_REMINDER_24H,
        payload: { appointmentId },
        deduplicationKey: reminderKey(appointmentId),
      }],
      skipDuplicates: true,
    });
    return result.count;
  }
}
