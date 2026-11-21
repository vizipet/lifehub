import { PrismaService } from '../common/prisma/prisma.service';
import {
  type NotificationEmailSender,
} from './notification-email.contract';
import { NotificationEmailService } from './notification-email.service';
import { APPOINTMENT_REMINDER_24H, reminderKey } from './appointment-reminder.event';
import { AppointmentStatus, AvailabilityStatus, UserRole, UserStatus } from '../generated/prisma/client';

describe('NotificationEmailService', () => {
  let service: NotificationEmailService;

  const findUnique = jest.fn();
  const findAppointment = jest.fn();
  const updateMany = jest.fn();
  const send = jest.fn();

  const prisma = {
    appointment: { findUnique: findAppointment },
    notification: {
      findUnique,
      updateMany,
    },
  } as unknown as PrismaService;

  const emailSender = {
    send,
  } as unknown as NotificationEmailSender;

  const notification = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Consulta confirmada',
    message: 'Sua consulta foi confirmada.',
    deduplicationKey:
      'APPOINTMENT_CONFIRMED:event-id:user-id',
    emailSentAt: null,
    user: {
      email: 'tutor@example.com',
      notificationPreference: {
        emailEnabled: true,
      },
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();

    findUnique.mockResolvedValue(notification);
    updateMany.mockResolvedValue({ count: 1 });
    send.mockResolvedValue(undefined);

    service = new NotificationEmailService(
      prisma,
      emailSender,
    );
  });

  it('envia e-mail quando a preferência permite', async () => {
    const result = await service.sendForNotification(
      notification.id,
    );

    expect(result).toBe('sent');

    expect(send).toHaveBeenCalledWith({
      to: 'tutor@example.com',
      subject: 'Consulta confirmada',
      text: 'Sua consulta foi confirmada.',
      idempotencyKey:
        'APPOINTMENT_CONFIRMED:event-id:user-id',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: notification.id,
        emailSentAt: null,
      },
      data: {
        emailSentAt: expect.any(Date),
      },
    });
  });

  it('não envia quando emailEnabled é false', async () => {
    findUnique.mockResolvedValue({
      ...notification,
      user: {
        ...notification.user,
        notificationPreference: {
          emailEnabled: false,
        },
      },
    });

    const result = await service.sendForNotification(
      notification.id,
    );

    expect(result).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('permite envio quando não existe preferência cadastrada', async () => {
    findUnique.mockResolvedValue({
      ...notification,
      user: {
        ...notification.user,
        notificationPreference: null,
      },
    });

    const result = await service.sendForNotification(
      notification.id,
    );

    expect(result).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('não reenvia uma notificação marcada como enviada', async () => {
    findUnique.mockResolvedValue({
      ...notification,
      emailSentAt: new Date(
        '2026-10-17T18:00:00.000Z',
      ),
    });

    const result = await service.sendForNotification(
      notification.id,
    );

    expect(result).toBe('already-sent');
    expect(send).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('propaga falha do provedor sem registrar emailSentAt', async () => {
    send.mockRejectedValue(
      new Error('Falha simulada no envio'),
    );

    await expect(
      service.sendForNotification(notification.id),
    ).rejects.toThrow('Falha simulada no envio');

    expect(send).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejeita notificação inexistente', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.sendForNotification(notification.id),
    ).rejects.toThrow(
      'Notificação para envio de e-mail não encontrada.',
    );

    expect(send).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([true, false])('reconfere appointmentReminders antes do e-mail: %s', async (enabled) => {
    const appointmentId = '33333333-3333-4333-8333-333333333333';
    findUnique.mockResolvedValue({ ...notification, userId: 'tutor-id',
      type: APPOINTMENT_REMINDER_24H, deduplicationKey: reminderKey(appointmentId) });
    findAppointment.mockResolvedValue({
      id: appointmentId, holderId: 'tutor-id', status: AppointmentStatus.CONFIRMED,
      slot: { startsAt: new Date(Date.now() + 3_600_000), status: AvailabilityStatus.BOOKED },
      holder: { role: UserRole.PATIENT, status: UserStatus.ACTIVE,
        notificationPreference: { appointmentReminders: enabled } },
    });
    expect(await service.sendForNotification(notification.id)).toBe(enabled ? 'sent' : 'skipped');
    expect(send).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(updateMany).toHaveBeenCalledTimes(enabled ? 1 : 0);
  });

  it('não envia lembrete de consulta já removida ou não elegível', async () => {
    const appointmentId = '33333333-3333-4333-8333-333333333333';
    findUnique.mockResolvedValue({ ...notification, userId: 'tutor-id',
      type: APPOINTMENT_REMINDER_24H, deduplicationKey: reminderKey(appointmentId) });
    findAppointment.mockResolvedValue(null);
    expect(await service.sendForNotification(notification.id)).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });
});
