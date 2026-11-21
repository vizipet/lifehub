import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { findDueAppointmentReminder } from '../appointments/appointment-reminder-context';
import { APPOINTMENT_REMINDER_24H, reminderAppointmentId } from './appointment-reminder.event';
import {
  NOTIFICATION_EMAIL_SENDER,
  type NotificationEmailSender,
} from './notification-email.contract';

export type NotificationEmailResult =
  | 'sent'
  | 'skipped'
  | 'already-sent';

@Injectable()
export class NotificationEmailService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_EMAIL_SENDER)
    private readonly emailSender: NotificationEmailSender,
  ) {}

  async sendForNotification(
    notificationId: string,
  ): Promise<NotificationEmailResult> {
    const notification =
      await this.prisma.notification.findUnique({
        where: {
          id: notificationId,
        },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          message: true,
          deduplicationKey: true,
          emailSentAt: true,
          user: {
            select: {
              email: true,
              notificationPreference: {
                select: {
                  emailEnabled: true,
                },
              },
            },
          },
        },
      });

    if (!notification) {
      throw new Error(
        'Notificação para envio de e-mail não encontrada.',
      );
    }

    if (notification.emailSentAt !== null) {
      return 'already-sent';
    }

    if (
      notification.user.notificationPreference
        ?.emailEnabled === false
    ) {
      return 'skipped';
    }

    if (notification.type === APPOINTMENT_REMINDER_24H) {
      const appointment = await findDueAppointmentReminder(
        this.prisma, reminderAppointmentId(notification.deduplicationKey), new Date(),
      );
      if (!appointment || appointment.holderId !== notification.userId) return 'skipped';
    }

    await this.emailSender.send({
      to: notification.user.email,
      subject: notification.title,
      text: notification.message,
      idempotencyKey: notification.deduplicationKey,
    });

    await this.prisma.notification.updateMany({
      where: {
        id: notification.id,
        emailSentAt: null,
      },
      data: {
        emailSentAt: new Date(),
      },
    });

    return 'sent';
  }
}