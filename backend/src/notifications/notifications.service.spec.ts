import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const appointmentFindUnique = jest.fn();
  const notificationUpsert = jest.fn();

  const prisma = {
    appointment: {
      findUnique: appointmentFindUnique,
    },
    notification: {
      upsert: notificationUpsert,
    },
  } as unknown as PrismaService;

  const appointment = {
    id: 'appointment-id',
    holderId: '11111111-1111-4111-8111-111111111111',
    serviceNameSnapshot: 'Consulta veterinária',
    professionalNameSnapshot: 'Dra. Ana',
    clinicNameSnapshot: 'Clínica Vizipet',
    professional: {
      userId:
        '22222222-2222-4222-8222-222222222222',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    appointmentFindUnique.mockResolvedValue(
      appointment,
    );

    notificationUpsert.mockImplementation(
      async ({ create }) => ({
        id: 'notification-id',
        ...create,
      }),
    );

    service = new NotificationsService(prisma);
  });

  it('cria notificação de confirmação para o tutor', async () => {
    const event = {
      id: '33333333-3333-4333-8333-333333333333',
      type: 'APPOINTMENT_CONFIRMED',
      payload: {
        appointmentId: appointment.id,
        holderId: appointment.holderId,
        patientId: 'pet-id',
        slotId: 'slot-id',
        clinicId: 'clinic-id',
      },
    };

    await service.createFromOutboxEvent(event);

    expect(notificationUpsert).toHaveBeenCalledWith({
      where: {
        deduplicationKey:
          `APPOINTMENT_CONFIRMED:${event.id}:${appointment.holderId}`,
      },
      update: {},
      create: expect.objectContaining({
        userId: appointment.holderId,
        type: 'APPOINTMENT_CONFIRMED',
        title: 'Consulta confirmada',
        deduplicationKey:
          `APPOINTMENT_CONFIRMED:${event.id}:${appointment.holderId}`,
      }),
    });
  });

  it('notifica profissional quando tutor cancela', async () => {
    const event = {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'APPOINTMENT_CANCELLED',
      payload: {
        appointmentId: appointment.id,
        holderId: appointment.holderId,
        professionalId: 'professional-id',
        clinicId: 'clinic-id',
        slotId: 'slot-id',
        cancelledBy: UserRole.PATIENT,
      },
    };

    await service.createFromOutboxEvent(event);

    expect(notificationUpsert).toHaveBeenCalledWith({
      where: {
        deduplicationKey:
          `APPOINTMENT_CANCELLED:${event.id}:${appointment.professional.userId}`,
      },
      update: {},
      create: expect.objectContaining({
        userId: appointment.professional.userId,
        type: 'APPOINTMENT_CANCELLED',
        title: 'Consulta cancelada',
      }),
    });
  });

  it('notifica tutor quando profissional cancela', async () => {
    const event = {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'APPOINTMENT_CANCELLED',
      payload: {
        appointmentId: appointment.id,
        holderId: appointment.holderId,
        professionalId: 'professional-id',
        clinicId: 'clinic-id',
        slotId: 'slot-id',
        cancelledBy: UserRole.PROFESSIONAL,
        reason: 'Imprevisto profissional.',
      },
    };

    await service.createFromOutboxEvent(event);

    expect(notificationUpsert).toHaveBeenCalledWith({
      where: {
        deduplicationKey:
          `APPOINTMENT_CANCELLED:${event.id}:${appointment.holderId}`,
      },
      update: {},
      create: expect.objectContaining({
        userId: appointment.holderId,
        message: expect.stringContaining(
          'Imprevisto profissional.',
        ),
      }),
    });
  });

  it('usa a mesma deduplicationKey ao reprocessar o evento', async () => {
    const event = {
      id: '66666666-6666-4666-8666-666666666666',
      type: 'APPOINTMENT_CONFIRMED',
      payload: {
        appointmentId: appointment.id,
      },
    };

    await service.createFromOutboxEvent(event);
    await service.createFromOutboxEvent(event);

    // Cada processamento avisa o paciente e o médico (2 notificações).
    const keys = notificationUpsert.mock.calls.map(
      ([args]) => args.where.deduplicationKey,
    );
    expect(keys).toHaveLength(4);
    expect(keys[0]).toBe(keys[2]);
    expect(keys[1]).toBe(keys[3]);
  });

  it('avisa o médico de cada consulta nova na agenda dele', async () => {
    await service.createFromOutboxEvent({
      id: '77777777-7777-4777-8777-777777777777',
      type: 'APPOINTMENT_CONFIRMED',
      payload: { appointmentId: appointment.id },
    });

    expect(notificationUpsert.mock.calls[1][0].create).toMatchObject({
      userId: appointment.professional.userId,
      type: 'APPOINTMENT_BOOKED_FOR_PROFESSIONAL',
      title: 'Nova consulta na sua agenda',
    });
  });

  it('rejeita tipo de evento não suportado', async () => {
    await expect(
      service.createFromOutboxEvent({
        id: '77777777-7777-4777-8777-777777777777',
        type: 'UNKNOWN_EVENT',
        payload: {
          appointmentId: appointment.id,
        },
      }),
    ).rejects.toThrow(
      'Tipo de evento da Outbox não suportado',
    );

    expect(
      notificationUpsert,
    ).not.toHaveBeenCalled();
  });
});