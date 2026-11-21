import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AppointmentReminderOutboxService } from '../notifications/appointment-reminder-outbox.service';
import { REMINDER_KEY_SUFFIX, REMINDER_WINDOW_MS } from '../notifications/appointment-reminder.event';

@Injectable()
export class AppointmentRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: AppointmentReminderOutboxService,
  ) {}

  async enqueueBatch(now: Date, batchSize: number) {
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
      throw new Error('INVALID_REMINDER_BATCH');
    }
    const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const eligible = Prisma.sql`
      FROM public.appointments a
      JOIN public.availability_slots s ON s.id = a.slot_id
      JOIN public.users u ON u.id = a.holder_id
      LEFT JOIN public.notification_preferences p ON p.user_id = u.id
      WHERE a.status = 'CONFIRMED' AND s.status = 'BOOKED'
        AND u.status = 'ACTIVE' AND u.role = 'PATIENT'
        AND p.appointment_reminders IS DISTINCT FROM false
        AND s.starts_at > ${now} AND s.starts_at <= ${horizon}
        AND NOT EXISTS (
          SELECT 1 FROM public.outbox_events e
          WHERE e.deduplication_key = a.id::text || ${REMINDER_KEY_SUFFIX}
        )
    `;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT a.id ${eligible}
        ORDER BY s.starts_at ASC, a.id ASC
        LIMIT ${batchSize} FOR UPDATE OF a SKIP LOCKED
      `);
      let processedCount = 0;
      for (const row of rows) {
        processedCount += await this.outbox.enqueue(tx, row.id);
      }
      const remaining = await tx.$queryRaw<Array<{ hasMore: boolean }>>(Prisma.sql`
        SELECT EXISTS (SELECT 1 ${eligible}) AS "hasMore"
      `);
      return { processedCount, hasMore: remaining[0]?.hasMore === true };
    }, { timeout: 10_000 });
  }
}
