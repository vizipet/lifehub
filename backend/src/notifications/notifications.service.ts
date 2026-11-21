import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ListNotificationsQueryDto } from './list-notifications-query.dto';
import { PROFESSIONAL_VERIFICATION_DECIDED } from './verification-decision.event';
import { createVerificationResultNotification } from './verification-result.notification';
import { UserRole } from '../generated/prisma/client';
import { APPOINTMENT_REMINDER_24H } from './appointment-reminder.event';
import { createAppointmentReminderNotification } from './appointment-reminder.notification';

interface NotificationOutboxEvent {
  id: string;
  type: string;
  payload: unknown;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
    async listForUser(
    userId: string,
    query: ListNotificationsQueryDto,
  ) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where,
      }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
async markAsRead(
  userId: string,
  notificationId: string,
) {
  await this.prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  const notification =
    await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
        readAt: true,
      },
    });

  if (!notification) {
    throw new NotFoundException(
      'Notificação não encontrada.',
    );
  }

  return {
    data: notification,
  };
}
async markAllAsRead(userId: string) {
  const result = await this.prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return {
    data: {
      updatedCount: result.count,
    },
  };
}
  async createFromOutboxEvent(
    event: NotificationOutboxEvent,
  ) {
    if (event.type === APPOINTMENT_REMINDER_24H) {
      return createAppointmentReminderNotification(this.prisma, event.payload);
    }
    if (event.type === PROFESSIONAL_VERIFICATION_DECIDED) {
      return createVerificationResultNotification(this.prisma, event.payload);
    }
    const payload = this.parsePayload(event.payload);

    const appointmentId = this.requiredString(
      payload,
      'appointmentId',
    );

    const appointment =
      await this.prisma.appointment.findUnique({
        where: {
          id: appointmentId,
        },
        select: {
          id: true,
          holderId: true,
          serviceNameSnapshot: true,
          professionalNameSnapshot: true,
          clinicNameSnapshot: true,
          professional: {
            select: {
              userId: true,
            },
          },
        },
      });

    if (!appointment) {
      throw new Error(
        'Appointment do evento da Outbox não foi encontrado.',
      );
    }

    const content = this.buildNotificationContent(
      event.type,
      payload,
      appointment,
    );

    const deduplicationKey = [
      event.type,
      event.id,
      content.userId,
    ].join(':');

    return this.prisma.notification.upsert({
      where: {
        deduplicationKey,
      },
      update: {},
      create: {
        userId: content.userId,
        type: event.type,
        title: content.title,
        message: content.message,
        deduplicationKey,
      },
    });
  }

  private buildNotificationContent(
    eventType: string,
    payload: Record<string, unknown>,
    appointment: {
      holderId: string;
      serviceNameSnapshot: string;
      professionalNameSnapshot: string;
      clinicNameSnapshot: string;
      professional: {
        userId: string;
      };
    },
  ) {
    if (eventType === 'APPOINTMENT_CONFIRMED') {
      return {
        userId: appointment.holderId,
        title: 'Consulta confirmada',
        message:
          `Seu agendamento de ${appointment.serviceNameSnapshot} ` +
          `com ${appointment.professionalNameSnapshot} ` +
          `foi confirmado em ${appointment.clinicNameSnapshot}.`,
      };
    }

    if (eventType === 'APPOINTMENT_CANCELLED') {
      const cancelledBy = this.requiredString(
        payload,
        'cancelledBy',
      );

      if (cancelledBy === UserRole.PATIENT) {
        return {
          userId: appointment.professional.userId,
          title: 'Consulta cancelada',
          message:
            `O agendamento de ${appointment.serviceNameSnapshot} ` +
            'foi cancelado pelo paciente.',
        };
      }

      if (cancelledBy === UserRole.PROFESSIONAL) {
        const reason = this.optionalString(
          payload,
          'reason',
        );

        return {
          userId: appointment.holderId,
          title: 'Consulta cancelada',
          message:
            `Seu agendamento de ${appointment.serviceNameSnapshot} ` +
            `com ${appointment.professionalNameSnapshot} ` +
            'foi cancelado pelo profissional.' +
            (reason ? ` Motivo: ${reason}` : ''),
        };
      }

      throw new Error(
        'Origem do cancelamento da Outbox é inválida.',
      );
    }

    throw new Error(
      `Tipo de evento da Outbox não suportado: ${eventType}`,
    );
  }

  private parsePayload(
    payload: unknown,
  ): Record<string, unknown> {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new Error(
        'Payload da Outbox é inválido.',
      );
    }

    return payload as Record<string, unknown>;
  }

  private requiredString(
    payload: Record<string, unknown>,
    field: string,
  ): string {
    const value = payload[field];

    if (
      typeof value !== 'string' ||
      value.trim().length === 0
    ) {
      throw new Error(
        `Campo obrigatório ausente no evento da Outbox: ${field}`,
      );
    }

    return value.trim();
  }

  private optionalString(
    payload: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const value = payload[field];

    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0
      ? trimmed
      : undefined;
  }
}
