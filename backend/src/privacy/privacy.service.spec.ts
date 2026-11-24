import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OUTBOX_CONTRACT } from '../auth/contracts/outbox.contract';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { PasswordHashService } from '../auth/services/password-hash.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PrivacyService } from './privacy.service';
import { CpfProtector } from '../common/security/cpf';
import { testCpf } from '../common/security/cpf.testing';

describe('PrivacyService', () => {
  let service: PrivacyService;

  const tx = {
    $queryRaw: jest.fn(),
    privacyRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    appointment: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    availabilitySlot: { updateMany: jest.fn() },
    professional: { findUnique: jest.fn(), update: jest.fn() },
    patient: { updateMany: jest.fn() },
    patientPhoto: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn(), createMany: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn() },
    idempotencyKey: { deleteMany: jest.fn() },
    notificationPreference: { deleteMany: jest.fn() },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    patient: {
      findMany: jest.fn(),
    },
    legalAcceptance: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationPreference: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    privacyRequest: {
      findMany: jest.fn(),
    },
    appointment: { findMany: jest.fn() },
    patientPhoto: { deleteMany: jest.fn() },
    notification: { findMany: jest.fn() },
    professional: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const passwordHashService = {
    verify: jest.fn(),
  };

  const authSessionsService = {
    revokeAllForUser: jest.fn(),
  };

  const outbox = { emitOutbox: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 'user-id' }]);
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
      status: 'ACTIVE',
    });
    outbox.emitOutbox.mockResolvedValue(undefined);

    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: OUTBOX_CONTRACT, useValue: outbox },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: PasswordHashService,
          useValue: passwordHashService,
        },
        {
          provide: AuthSessionsService,
          useValue: authSessionsService,
        },
        { provide: CpfProtector, useValue: testCpf() },
      ],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
  });

  it('retorna preferências padrão', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({
      id: 'preference-id',
      userId: 'user-id',
      emailEnabled: true,
      appointmentReminders: true,
      campaignUpdates: true,
    });

    const result = await service.getNotificationPreferences('user-id');

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
      },
      update: {},
      create: {
        userId: 'user-id',
      },
    });

    expect(result).toMatchObject({
      emailEnabled: true,
      appointmentReminders: true,
      campaignUpdates: true,
    });
  });

  it('atualiza preferências parcialmente', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({
      id: 'preference-id',
      userId: 'user-id',
      emailEnabled: true,
      appointmentReminders: true,
      campaignUpdates: false,
    });

    const result = await service.updateNotificationPreferences('user-id', {
      campaignUpdates: false,
    });

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
      },
      update: {
        campaignUpdates: false,
      },
      create: {
        userId: 'user-id',
        campaignUpdates: false,
      },
    });

    expect(result.campaignUpdates).toBe(false);
  });

  it('exporta somente dados do usuário, com o CPF aberto para o próprio titular', async () => {
    const cpf = testCpf();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'José',
      email: 'jose@example.com',
      phone: '81999999999',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfEncrypted: cpf.protect('52998224725').cpfEncrypted,
      role: 'PATIENT',
      status: 'ACTIVE',
    });
    prisma.patient.findMany.mockResolvedValue([
      {
        id: 'patient-id',
        name: 'Lucas',
        relationship: 'CHILD',
        birthDate: new Date('2018-03-02T00:00:00Z'),
        cpfEncrypted: null,
      },
    ]);
    prisma.legalAcceptance.findMany.mockResolvedValue([]);
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.privacyRequest.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([{ id: 'appointment-id' }]);
    prisma.notification.findMany.mockResolvedValue([{ id: 'notification-id' }]);
    prisma.professional.findUnique.mockResolvedValue(null);

    const result = await service.exportUserData('user-id');

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { holderId: 'user-id' } }),
    );
    expect(result.account).toMatchObject({ id: 'user-id', cpf: '52998224725', birthDate: '1990-05-10' });
    expect(result.account).not.toHaveProperty('cpfEncrypted');
    expect(result.patients).toEqual([
      expect.objectContaining({ id: 'patient-id', cpf: null, birthDate: '2018-03-02' }),
    ]);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('sessions');
    expect(result).toMatchObject({
      application: 'LifeHub',
      documentFiles: 'metadata_only',
      appointments: [{ id: 'appointment-id' }],
      notifications: [{ id: 'notification-id' }],
      professional: null,
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ holderId: 'user-id' }, { professional: { userId: 'user-id' } }] },
      }),
    );
    const profileQuery = prisma.professional.findUnique.mock.calls[0][0];
    expect(profileQuery.select.verificationDocuments.select).not.toHaveProperty('storagePath');
  });

  it('rejeita exclusão com senha inválida', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      service.requestAccountDeletion('user-id', 'senha-incorreta'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(authSessionsService.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('exclui na hora: revoga sessões, cancela consultas futuras e anonimiza dados', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-id', passwordHash: 'hash' });
    passwordHashService.verify.mockResolvedValue(true);
    tx.privacyRequest.create.mockResolvedValue({ id: 'privacy-request-id' });
    tx.privacyRequest.update.mockResolvedValue({ id: 'privacy-request-id', status: 'COMPLETED' });
    tx.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-id',
        slotId: 'slot-id',
        serviceNameSnapshot: 'Consulta',
        clinicNameSnapshot: 'Clínica Vida',
        professional: { userId: 'doctor-user-id' },
        slot: { startsAt: new Date('2026-12-01T13:00:00Z') },
      },
    ]);
    tx.professional.findUnique.mockResolvedValue(null);

    const result = await service.requestAccountDeletion('user-id', 'senha-correta');

    // O médico fica sabendo que o horário vagou, sem o nome de quem pediu para apagar os dados.
    const aviso = tx.notification.createMany.mock.calls[0][0].data[0];
    expect(aviso).toMatchObject({ userId: 'doctor-user-id', type: 'APPOINTMENT_CANCELLED' });
    expect(aviso.message).toContain('Um paciente encerrou a conta');
    expect(aviso.message).toContain('01/12');

    expect(authSessionsService.revokeAllForUser).toHaveBeenCalledWith('user-id', tx);
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-id' },
      data: expect.objectContaining({ status: 'CANCELLED_BY_PATIENT' }),
    });
    expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-id', status: 'BOOKED' },
      data: { status: 'AVAILABLE' },
    });
    expect(tx.patient.updateMany).toHaveBeenCalledWith({
      where: { holderId: 'user-id' },
      data: expect.objectContaining({ name: 'Paciente removido', cpfHash: null, cpfEncrypted: null }),
    });
    expect(tx.patientPhoto.deleteMany).toHaveBeenCalledWith({ where: { patient: { holderId: 'user-id' } } });
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-id' } });
    const anonymized = tx.user.update.mock.calls.at(-1)[0].data;
    expect(anonymized).toMatchObject({ name: 'Conta excluída', phone: '', status: 'DELETED' });
    expect(anonymized.email).toMatch(/@lifehub\.invalid$/);
    expect(anonymized.cpfEncrypted).toBe('');
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'privacy-request-id', status: 'COMPLETED' });
  });

  it('ao excluir conta de médico, cancela consultas dele e tira da busca', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-id', passwordHash: 'hash' });
    passwordHashService.verify.mockResolvedValue(true);
    tx.privacyRequest.create.mockResolvedValue({ id: 'privacy-request-id' });
    tx.appointment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'booked-id',
        holderId: 'patient-user-id',
        serviceNameSnapshot: 'Consulta',
        clinicNameSnapshot: 'Clínica Central',
        slot: { startsAt: new Date('2030-01-10T12:00:00Z') },
      },
    ]);
    tx.professional.findUnique.mockResolvedValue({ id: 'professional-id' });

    await service.requestAccountDeletion('user-id', 'senha-correta');

    expect(tx.professional.update).toHaveBeenCalledWith({
      where: { id: 'professional-id' },
      data: expect.objectContaining({ verificationStatus: 'SUSPENDED', bio: null, photoStoragePath: null }),
    });
    // O paciente é avisado do cancelamento.
    expect(tx.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({
      userId: 'patient-user-id',
      title: 'Consulta cancelada',
    });
    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['booked-id'] } },
      data: expect.objectContaining({ status: 'CANCELLED_BY_PROVIDER' }),
    });
  });

  it('não inicia transação para usuário inexistente', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.requestAccountDeletion('missing-user', 'password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });

  it('recusa senha alterada entre reautenticação e bloqueio da conta', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
    });
    passwordHashService.verify.mockResolvedValue(true);
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'new-hash',
      status: 'ACTIVE',
    });
    await expect(
      service.requestAccountDeletion('user-id', 'password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.privacyRequest.create).not.toHaveBeenCalled();
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });

  it('reutiliza solicitação concorrente sem emitir outra tarefa', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
    });
    passwordHashService.verify.mockResolvedValue(true);
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
      status: 'DELETION_PENDING',
    });
    tx.privacyRequest.findFirst.mockResolvedValue({ id: 'existing-request' });
    expect(await service.requestAccountDeletion('user-id', 'password')).toEqual(
      { id: 'existing-request' },
    );
    expect(tx.privacyRequest.create).not.toHaveBeenCalled();
    expect(authSessionsService.revokeAllForUser).not.toHaveBeenCalled();
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });

  it.each(['BLOCKED', 'DELETED'])('não altera conta %s', async (status) => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
    });
    passwordHashService.verify.mockResolvedValue(true);
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'hash',
      status,
    });
    await expect(
      service.requestAccountDeletion('user-id', 'password'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.privacyRequest.create).not.toHaveBeenCalled();
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });

  it('recusa aceite de versão que não está vigente', async () => {
    await expect(
      service.registerLegalAcceptance('user-id', { documentType: 'TERMS_OF_USE', version: '0.9' }),
    ).rejects.toMatchObject({ response: { code: 'LEGAL_VERSION_NOT_CURRENT' } });
    expect(prisma.legalAcceptance.upsert).not.toHaveBeenCalled();
  });

  it('registra aceite de documento legal sem duplicar a mesma versão', async () => {
    prisma.legalAcceptance.upsert.mockResolvedValue({
      id: 'acceptance-id',
      userId: 'user-id',
      documentType: 'TERMS_OF_USE',
      version: '1.0',
    });

    const result = await service.registerLegalAcceptance('user-id', {
      documentType: 'TERMS_OF_USE',
      version: '1.0',
    });

    expect(prisma.legalAcceptance.upsert).toHaveBeenCalledWith({
      where: {
        userId_documentType_version: {
          userId: 'user-id',
          documentType: 'TERMS_OF_USE',
          version: '1.0',
        },
      },
      update: {},
      create: {
        userId: 'user-id',
        documentType: 'TERMS_OF_USE',
        version: '1.0',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'acceptance-id',
        userId: 'user-id',
        documentType: 'TERMS_OF_USE',
        version: '1.0',
      }),
    );
  });
});
