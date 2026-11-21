import type { AuditService } from '../audit/audit.service';
import type { AuthSessionsService } from '../auth/services/auth-sessions.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { testCpf } from '../common/security/cpf.testing';
import { AdminManagementService } from './admin-management.service';

describe('AdminManagementService — aprovação de clínica', () => {
  const tx = {
    clinic: { findUnique: jest.fn(), update: jest.fn() },
    clinicProfessional: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const audit = { record: jest.fn() };
  let service: AdminManagementService;

  const allChecked = { cnesChecked: true, addressMatches: true, professionalListed: true, documentChecked: true };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
    tx.clinic.findUnique.mockResolvedValue({ id: 'clinic-id', verificationStatus: 'PENDING', cnes: '1234567', _count: { documents: 1 } });
    tx.clinic.update.mockResolvedValue({ id: 'clinic-id', name: 'Clínica X', verificationStatus: 'APPROVED' });
    tx.clinicProfessional.findMany.mockResolvedValue([{ professional: { userId: 'doctor-user-id' } }]);
    service = new AdminManagementService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as AuthSessionsService,
      testCpf(),
      {} as never,
    );
  });

  it('não aprova sem a conferência completa no CNES', async () => {
    await expect(
      service.decideClinic('admin-id', 'clinic-id', {
        decision: 'APPROVED',
        checklist: { ...allChecked, professionalListed: false },
      }),
    ).rejects.toMatchObject({ response: { code: 'CLINIC_CHECKLIST_INCOMPLETE' } });
    await expect(service.decideClinic('admin-id', 'clinic-id', { decision: 'APPROVED' })).rejects.toMatchObject({
      response: { code: 'CLINIC_CHECKLIST_INCOMPLETE' },
    });
    expect(tx.clinic.update).not.toHaveBeenCalled();
  });

  it('não aprova local sem CNES', async () => {
    tx.clinic.findUnique.mockResolvedValue({ id: 'clinic-id', verificationStatus: 'PENDING', cnes: null, _count: { documents: 1 } });
    await expect(
      service.decideClinic('admin-id', 'clinic-id', { decision: 'APPROVED', checklist: allChecked }),
    ).rejects.toMatchObject({ response: { code: 'CLINIC_WITHOUT_CNES' } });
  });

  it('não aprova local sem documento', async () => {
    tx.clinic.findUnique.mockResolvedValue({ id: 'clinic-id', verificationStatus: 'PENDING', cnes: '1234567', _count: { documents: 0 } });
    await expect(
      service.decideClinic('admin-id', 'clinic-id', { decision: 'APPROVED', checklist: allChecked }),
    ).rejects.toMatchObject({ response: { code: 'CLINIC_WITHOUT_DOCUMENT' } });
  });

  it('aprova com a conferência e grava o que foi conferido na auditoria', async () => {
    await service.decideClinic('admin-id', 'clinic-id', { decision: 'APPROVED', checklist: allChecked });
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'CLINIC_APPROVED',
      details: { cnes: '1234567', checklist: allChecked },
    });
  });

  it('guarda o motivo no local e avisa o médico', async () => {
    await service.decideClinic('admin-id', 'clinic-id', { decision: 'CHANGES_REQUESTED', reason: 'CNES não confere.' });
    expect(tx.clinic.update.mock.calls[0][0].data).toMatchObject({ verificationNote: 'CNES não confere.' });
    expect(tx.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({
      userId: 'doctor-user-id',
      title: 'Correção pedida no local de atendimento',
    });
    expect(tx.notification.createMany.mock.calls[0][0].data[0].message).toContain('CNES não confere.');
  });

  it('pedir correção não exige conferência, mas exige motivo', async () => {
    await expect(service.decideClinic('admin-id', 'clinic-id', { decision: 'CHANGES_REQUESTED' })).rejects.toMatchObject({
      response: { code: 'DECISION_REASON_REQUIRED' },
    });
    await service.decideClinic('admin-id', 'clinic-id', { decision: 'CHANGES_REQUESTED', reason: 'CNES não encontrado.' });
    expect(tx.clinic.update).toHaveBeenCalled();
  });
});
