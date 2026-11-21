import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { ClinicsService } from '../clinics/clinics.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { describeAudit } from '../admin/audit-describe';
import { ServicesService } from './services.service';

describe('ServicesService — dono do serviço, exclusão e histórico', () => {
  const OWN = 'own-professional';
  const prisma = {
    professional: { findUnique: jest.fn() },
    service: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), create: jest.fn() },
    serviceProfessional: { deleteMany: jest.fn() },
    availabilitySlot: { count: jest.fn() },
    appointment: { count: jest.fn() },
    clinicProfessional: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const clinics = { findMineById: jest.fn() };
  let service: ServicesService;

  const consulta = {
    id: 'service-id',
    clinicId: 'clinic-id',
    name: 'Consulta',
    description: null,
    modality: 'IN_PERSON',
    durationMinutes: 40,
    priceCents: 18000,
    isActive: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.professional.findUnique.mockResolvedValue({ id: OWN });
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
    clinics.findMineById.mockResolvedValue({ id: 'clinic-id' });
    service = new ServicesService(
      prisma as unknown as PrismaService,
      clinics as unknown as ClinicsService,
      audit as unknown as AuditService,
    );
  });

  it('lista só os serviços do médico logado, mesmo dividindo a clínica', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    await service.listMine('clinic-id', 'user-id');
    expect(prisma.service.findMany.mock.calls[0][0].where).toEqual({
      clinicId: 'clinic-id',
      professionalLinks: { some: { professionalId: OWN } },
    });
  });

  it('serviço de colega responde como inexistente (não dá para editar)', async () => {
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(service.updateMine('clinic-id', 'service-id', 'user-id', { isActive: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('não deixa cadastrar serviço em nome de outro médico', async () => {
    await expect(
      service.createMine('clinic-id', 'user-id', {
        name: 'Consulta',
        modality: 'IN_PERSON',
        durationMinutes: 30,
        professionalIds: ['outro-medico'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('registra o antes e depois ao mudar o preço', async () => {
    prisma.service.findFirst.mockResolvedValue(consulta);
    prisma.service.update.mockResolvedValue({ ...consulta, priceCents: 25000 });

    await service.updateMine('clinic-id', 'service-id', 'user-id', { priceCents: 25000 });

    const record = audit.record.mock.calls[0][0];
    expect(record).toMatchObject({
      actorId: 'user-id',
      action: 'SERVICE_UPDATED',
      entityId: 'service-id',
      details: { changes: { priceCents: { from: 18000, to: 25000 } } },
    });
    expect(describeAudit(record.action, record.details).map((line) => line.replace(/\s/g, ' '))).toContain(
      'Valor: R$ 180,00 → R$ 250,00',
    );
  });

  it('desativar vira uma ação própria no histórico', async () => {
    prisma.service.findFirst.mockResolvedValue(consulta);
    prisma.service.update.mockResolvedValue({ ...consulta, isActive: false });
    await service.updateMine('clinic-id', 'service-id', 'user-id', { isActive: false });
    expect(audit.record.mock.calls[0][0].action).toBe('SERVICE_DEACTIVATED');
  });

  it('salvar sem mudar nada não gera registro', async () => {
    prisma.service.findFirst.mockResolvedValue(consulta);
    prisma.service.update.mockResolvedValue(consulta);
    await service.updateMine('clinic-id', 'service-id', 'user-id', { priceCents: 18000 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('não exclui serviço que já teve horários ou consultas', async () => {
    prisma.service.findFirst.mockResolvedValue(consulta);
    prisma.availabilitySlot.count.mockResolvedValue(3);
    prisma.appointment.count.mockResolvedValue(0);
    await expect(service.deleteMine('clinic-id', 'service-id', 'user-id')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.service.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('exclui serviço nunca usado e registra o que foi apagado', async () => {
    prisma.service.findFirst.mockResolvedValue(consulta);
    prisma.availabilitySlot.count.mockResolvedValue(0);
    prisma.appointment.count.mockResolvedValue(0);

    await service.deleteMine('clinic-id', 'service-id', 'user-id');

    expect(prisma.service.delete).toHaveBeenCalledWith({ where: { id: 'service-id' } });
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'SERVICE_DELETED',
      details: { name: 'Consulta', priceCents: 18000 },
    });
  });
});
