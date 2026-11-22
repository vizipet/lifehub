import type { AuditService } from '../audit/audit.service';
import type { AuthSessionsService } from '../auth/services/auth-sessions.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { testCpf } from '../common/security/cpf.testing';
import { AdminManagementService } from './admin-management.service';

describe('AdminManagementService — bloqueio de conta', () => {
  const tx = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    professional: { findUnique: jest.fn() },
    appointment: { findMany: jest.fn(), updateMany: jest.fn() },
    availabilitySlot: { updateMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const audit = { record: jest.fn() };
  const sessions = { revokeAllForUser: jest.fn() };
  let service: AdminManagementService;

  const booked = {
    id: 'appt-1',
    slotId: 'slot-1',
    holderId: 'holder-id',
    serviceNameSnapshot: 'Consulta',
    professionalNameSnapshot: 'Dra. Helena Costa',
    clinicNameSnapshot: 'Clínica Vida',
    patient: { name: 'Lucas' },
    professional: { userId: 'doctor-user-id' },
    slot: { startsAt: new Date('2026-12-01T13:00:00Z') },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
    tx.user.update.mockResolvedValue({ id: 'user-id', name: 'Fulano', status: 'BLOCKED' });
    tx.appointment.findMany.mockResolvedValue([booked]);
    service = new AdminManagementService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      sessions as unknown as AuthSessionsService,
      testCpf(),
      {} as never,
    );
  });

  it('bloquear paciente cancela as consultas futuras, libera o horário e avisa o médico', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user-id', role: 'PATIENT', status: 'ACTIVE' });

    const result = await service.updateUserStatus('admin-id', 'user-id', { status: 'BLOCKED', reason: 'Alerta de segurança.' } as never);

    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-id', tx);
    expect(tx.appointment.findMany.mock.calls[0][0].where).toMatchObject({ holderId: 'user-id', status: 'CONFIRMED' });
    expect(tx.appointment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED_BY_PATIENT' });
    expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['slot-1'] }, status: 'BOOKED' },
      data: { status: 'AVAILABLE' },
    });
    const aviso = tx.notification.createMany.mock.calls[0][0].data[0];
    expect(aviso).toMatchObject({ userId: 'doctor-user-id', type: 'APPOINTMENT_CANCELLED' });
    expect(aviso.message).toContain('Lucas');
    expect(result.cancelledAppointments).toBe(1);
    expect(audit.record.mock.calls[0][0].details).toMatchObject({ cancelledAppointments: 1 });
  });

  it('bloquear médico cancela as consultas dele e avisa cada paciente', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user-id', role: 'PROFESSIONAL', status: 'ACTIVE' });
    tx.professional.findUnique.mockResolvedValue({ id: 'pro-id' });

    await service.updateUserStatus('admin-id', 'user-id', { status: 'BLOCKED', reason: 'CRM falso.' } as never);

    expect(tx.appointment.findMany.mock.calls[0][0].where).toMatchObject({ professionalId: 'pro-id' });
    expect(tx.appointment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED_BY_PROVIDER' });
    const aviso = tx.notification.createMany.mock.calls[0][0].data[0];
    expect(aviso).toMatchObject({ userId: 'holder-id' });
    expect(aviso.message).toContain('outro médico');
  });

  it('desbloquear não mexe em consultas', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user-id', role: 'PATIENT', status: 'BLOCKED' });

    const result = await service.updateUserStatus('admin-id', 'user-id', { status: 'ACTIVE', reason: 'Resolvido.' } as never);

    expect(tx.appointment.findMany).not.toHaveBeenCalled();
    expect(result.cancelledAppointments).toBe(0);
  });
});
