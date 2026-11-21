import { AppointmentStatus, AvailabilityStatus, UserRole, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { createAppointmentReminderNotification } from './appointment-reminder.notification';
import { APPOINTMENT_REMINDER_24H, reminderKey } from './appointment-reminder.event';
import { NotificationSkippedError } from './notification-skipped.error';

describe('Lembrete de consulta - criação e elegibilidade', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const db = { appointment: { findUnique }, notification: { upsert, findUniqueOrThrow } } as unknown as PrismaService;
  function appointment() {
    return {
      id, holderId: 'tutor-id', status: AppointmentStatus.CONFIRMED,
      serviceNameSnapshot: 'Consulta', professionalNameSnapshot: 'Profissional', clinicNameSnapshot: 'Clínica',
      slot: { startsAt: new Date(Date.now() + 3_600_000), status: AvailabilityStatus.BOOKED },
      holder: { role: UserRole.PATIENT, status: UserStatus.ACTIVE, notificationPreference: { appointmentReminders: true } },
    };
  }
  beforeEach(() => {
    jest.resetAllMocks();
    findUnique.mockResolvedValue(appointment());
    upsert.mockResolvedValue({ id: 'notification-id' });
  });

  it('deduplica pelo agendamento e obtém destinatário/conteúdo do banco', async () => {
    await createAppointmentReminderNotification(db, { appointmentId: id, recipientId: 'forged-recipient' });
    expect(upsert).toHaveBeenCalledWith({
      where: { deduplicationKey: `${id}:reminder:24h` }, update: {},
      create: {
        userId: 'tutor-id', type: APPOINTMENT_REMINDER_24H, title: 'Lembrete de consulta',
        message: expect.stringContaining('Consulta'), deduplicationKey: reminderKey(id),
      },
    });
  });

  it.each([null, [], {}, { appointmentId: 'invalid' }])('recusa payload inválido: %j', async (payload) => {
    await expect(createAppointmentReminderNotification(db, payload)).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    { status: AppointmentStatus.CANCELLED_BY_PATIENT },
    { status: AppointmentStatus.CANCELLED_BY_PROVIDER },
    { status: AppointmentStatus.COMPLETED },
    { slot: { startsAt: new Date(0), status: AvailabilityStatus.BOOKED } },
    { slot: { startsAt: new Date(Date.now() + 48 * 3_600_000), status: AvailabilityStatus.BOOKED } },
    { holder: { role: UserRole.PATIENT, status: UserStatus.BLOCKED } },
    { holder: { role: UserRole.PATIENT, status: UserStatus.DELETION_PENDING } },
    { holder: { role: UserRole.PATIENT, status: UserStatus.ACTIVE, notificationPreference: { appointmentReminders: false } } },
  ])('descarta lembrete obsoleto sem criar notificação: %j', async (change) => {
    findUnique.mockResolvedValue({ ...appointment(), ...change });
    await expect(createAppointmentReminderNotification(db, { appointmentId: id }))
      .rejects.toBeInstanceOf(NotificationSkippedError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('permite padrão quando não há preferência cadastrada', async () => {
    const row = appointment();
    findUnique.mockResolvedValue({ ...row, holder: { ...row.holder, notificationPreference: null } });
    await createAppointmentReminderNotification(db, { appointmentId: id });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('recupera a mesma notificação após colisão de criação concorrente', async () => {
    upsert.mockRejectedValue({ code: 'P2002' });
    findUniqueOrThrow.mockResolvedValue({ id: 'existing-id' });
    await expect(createAppointmentReminderNotification(db, { appointmentId: id }))
      .resolves.toEqual({ id: 'existing-id' });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { deduplicationKey: reminderKey(id) } });
  });

  it('propaga falha que não seja colisão de unicidade', async () => {
    upsert.mockRejectedValue(new Error('db-failed'));
    await expect(createAppointmentReminderNotification(db, { appointmentId: id })).rejects.toThrow('db-failed');
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
