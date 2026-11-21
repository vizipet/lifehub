import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service';
import { testCpf } from '../common/security/cpf.testing';
import { calculateAge, MAX_DEPENDENTS, PatientsService } from './patients.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'patient-id',
  holderId: 'holder-id',
  relationship: 'CHILD',
  name: 'Lucas Costa',
  birthDate: new Date('2018-03-02T00:00:00Z'),
  sex: 'MALE',
  cpfLast2: null,
  guardianConsentAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PatientsService', () => {
  const prisma = {
    patient: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    appointment: { count: jest.fn() },
    user: { findFirst: jest.fn() },
    safetyAlert: { findFirst: jest.fn(), create: jest.fn() },
  };
  const audit = { record: jest.fn() };
  let service: PatientsService;

  const dependent = {
    name: 'Ana Costa',
    birthDate: '2015-05-05',
    sex: 'FEMALE' as const,
    relationship: 'CHILD' as const,
    guardianConsent: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.safetyAlert.findFirst.mockResolvedValue(null);
    prisma.safetyAlert.create.mockResolvedValue({ id: 'alert-id' });
    service = new PatientsService(prisma as unknown as PrismaService, testCpf(), audit as never);
  });

  it('calcula idade considerando se o aniversário já passou', () => {
    expect(calculateAge(new Date('2000-12-31T00:00:00Z'), new Date('2026-11-21T00:00:00Z'))).toBe(25);
    expect(calculateAge(new Date('2000-01-01T00:00:00Z'), new Date('2026-11-21T00:00:00Z'))).toBe(26);
  });

  it('lista sempre o titular primeiro e nunca expõe o CPF completo', async () => {
    prisma.patient.findMany.mockResolvedValue([row(), row({ id: 'self', relationship: 'SELF', cpfLast2: '25' })]);
    const list = await service.listByHolder('holder-id');
    expect(list.map((p) => p.id)).toEqual(['self', 'patient-id']);
    expect(list[0]).toMatchObject({ isHolder: true, cpfMasked: '•••.•••.•••-25' });
    expect(JSON.stringify(list)).not.toMatch(/cpfHash|cpfEncrypted/);
    expect(prisma.patient.findMany.mock.calls[0][0].where).toEqual({ holderId: 'holder-id', deletedAt: null });
  });

  it('não encontra paciente de outra conta (busca sempre filtra pelo titular)', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(service.assertPatientOwnership('patient-id', 'outra-conta')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patient.findFirst.mock.calls[0][0].where).toEqual({
      id: 'patient-id',
      holderId: 'outra-conta',
      deletedAt: null,
    });
  });

  it('cadastra dependente com data da declaração do responsável e CPF protegido', async () => {
    prisma.patient.count.mockResolvedValue(0);
    prisma.patient.findFirst.mockResolvedValue(null);
    prisma.patient.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new-id' }));

    await service.createDependent('holder-id', { ...dependent, cpf: '390.533.447-05' });

    const data = prisma.patient.create.mock.calls[0][0].data;
    expect(data.guardianConsentAt).toBeInstanceOf(Date);
    expect(data.cpfLast2).toBe('05');
    expect(JSON.stringify(data)).not.toContain('39053344705');
  });

  it('registra a declaração do responsável na auditoria', async () => {
    prisma.patient.count.mockResolvedValue(0);
    prisma.patient.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new-id' }));

    await service.createDependent('holder-id', dependent);

    expect(audit.record.mock.calls[0][0]).toMatchObject({
      actorId: 'holder-id',
      action: 'DEPENDENT_CREATED',
      details: { declaration: 'GUARDIAN_UNDER_PENALTY_ART_299' },
    });
  });

  it('CPF de dependente que já está em outra conta vira alerta, sem bloquear', async () => {
    prisma.patient.count.mockResolvedValue(0);
    prisma.patient.findFirst.mockResolvedValue(null);
    prisma.patient.findMany.mockResolvedValue([{ holderId: 'outra-conta' }]);
    prisma.patient.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new-id' }));

    await expect(service.createDependent('holder-id', { ...dependent, cpf: '390.533.447-05' })).resolves.toBeDefined();

    const alert = prisma.safetyAlert.create.mock.calls[0][0].data;
    expect(alert).toMatchObject({ kind: 'DUPLICATE_CPF', holderId: 'holder-id', patientId: 'new-id' });
    expect(alert.details.otherHolderIds).toEqual(['outra-conta']);
    expect(JSON.stringify(alert)).not.toContain('39053344705');
  });

  it('muitas crianças em 24 h viram alerta', async () => {
    // 1ª contagem: limite de dependentes; 2ª: crianças nas últimas 24 h.
    prisma.patient.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    prisma.patient.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new-id' }));

    await service.createDependent('holder-id', dependent);

    expect(prisma.safetyAlert.create.mock.calls[0][0].data).toMatchObject({ kind: 'MANY_MINORS', holderId: 'holder-id' });
  });

  it('não duplica alerta que já está aberto', async () => {
    prisma.patient.count.mockResolvedValueOnce(2).mockResolvedValueOnce(4);
    prisma.safetyAlert.findFirst.mockResolvedValue({ id: 'ja-aberto' });
    prisma.patient.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new-id' }));

    await service.createDependent('holder-id', dependent);

    expect(prisma.safetyAlert.create).not.toHaveBeenCalled();
  });

  it('recusa CPF repetido na mesma conta', async () => {
    prisma.patient.count.mockResolvedValue(0);
    prisma.patient.findFirst.mockResolvedValue({ id: 'existente' });
    await expect(
      service.createDependent('holder-id', { ...dependent, cpf: '39053344705' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it(`limita a ${MAX_DEPENDENTS} dependentes por conta`, async () => {
    prisma.patient.count.mockResolvedValue(MAX_DEPENDENTS);
    await expect(service.createDependent('holder-id', dependent)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patient.create).not.toHaveBeenCalled();
  });

  it('não deixa trocar nome ou nascimento do titular por aqui', async () => {
    prisma.patient.findFirst.mockResolvedValue(row({ relationship: 'SELF' }));
    await expect(service.updateOwned('patient-id', 'holder-id', { name: 'Outro Nome' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('não remove o titular', async () => {
    prisma.patient.findFirst.mockResolvedValue(row({ relationship: 'SELF' }));
    await expect(service.removeOwned('patient-id', 'holder-id')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não remove dependente com consulta futura marcada', async () => {
    prisma.patient.findFirst.mockResolvedValue(row());
    prisma.appointment.count.mockResolvedValue(1);
    await expect(service.removeOwned('patient-id', 'holder-id')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('remoção é lógica e apaga o CPF do dependente', async () => {
    prisma.patient.findFirst.mockResolvedValue(row());
    prisma.appointment.count.mockResolvedValue(0);
    await service.removeOwned('patient-id', 'holder-id');
    expect(prisma.patient.update).toHaveBeenCalledWith({
      where: { id: 'patient-id' },
      data: { deletedAt: expect.any(Date), cpfHash: null, cpfEncrypted: null, cpfLast2: null },
    });
  });
});
