import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { UsersService } from './users.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { PasswordHashService } from '../auth/services/password-hash.service';
import { CpfProtector } from '../common/security/cpf';
import { testCpf } from '../common/security/cpf.testing';

describe('UsersService', () => {
  let usersService: UsersService;

  const prismaService = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    patient: { create: jest.fn(), updateMany: jest.fn() },
    legalAcceptance: { createMany: jest.fn() },
    notificationPreference: { create: jest.fn() },
  };

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const authSessionsService = {
    revokeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaService.$transaction.mockImplementation(async (work) =>
      work(prismaService),
    );
    prismaService.$queryRaw.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaService,
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

    usersService = moduleRef.get(UsersService);
  });

  it('normaliza o e-mail antes de consultar', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await usersService.findByEmail('  JOSE@EXEMPLO.COM  ');

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'jose@exemplo.com',
      },
    });
  });

  it('cria conta com e-mail normalizado, CPF protegido, titular e aceites LGPD', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockImplementation(async ({ data }) => ({
      id: 'user-id',
      ...data,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await usersService.create({
      name: ' Jose Teste ',
      email: '  JOSE@EXEMPLO.COM  ',
      phone: ' 81999999999 ',
      cpf: '529.982.247-25',
      birthDate: '1990-05-10',
      passwordHash: 'argon-hash',
      role: UserRole.PATIENT,
    });

    const data = prismaService.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: 'Jose Teste',
      email: 'jose@exemplo.com',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      role: UserRole.PATIENT,
      cpfLast2: '25',
    });
    // O CPF nunca é gravado em texto puro.
    expect(JSON.stringify(data)).not.toContain('52998224725');
    expect(data.cpfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(testCpf().reveal(data.cpfEncrypted)).toBe('52998224725');

    expect(prismaService.patient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ holderId: 'user-id', relationship: 'SELF', name: 'Jose Teste' }),
    });
    const acceptances = prismaService.legalAcceptance.createMany.mock.calls[0][0].data;
    expect(acceptances.map((item: { documentType: string }) => item.documentType).sort()).toEqual([
      'HEALTH_DATA_CONSENT',
      'PRIVACY_POLICY',
      'TERMS_OF_USE',
    ]);
    expect(prismaService.notificationPreference.create).toHaveBeenCalled();
  });

  it('localiza conta por CPF com ou sem pontuação, usando só o hash', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await usersService.findByLogin('529.982.247-25');

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { cpfHash: testCpf().hash('52998224725') },
    });
  });

  it('recusa e-mail já cadastrado', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'existing-user',
    });

    await expect(
      usersService.create({
        name: 'Jose Teste',
        email: 'jose@exemplo.com',
        phone: '81999999999',
        cpf: '52998224725',
        birthDate: '1990-05-10',
        passwordHash: 'argon-hash',
        role: UserRole.PATIENT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaService.user.create).not.toHaveBeenCalled();
  });
  it('atualiza nome e telefone sem exigir senha atual', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Jose',
      email: 'jose@exemplo.com',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    prismaService.user.update.mockResolvedValue({
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      id: 'user-id',
      name: 'Jose Atualizado',
      email: 'jose@exemplo.com',
      phone: '81988887777',
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await usersService.updateMe('user-id', {
      name: ' Jose Atualizado ',
      phone: ' 81988887777 ',
    });

    expect(passwordHashService.verify).not.toHaveBeenCalled();

    expect(prismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-id',
        },
        data: expect.objectContaining({
          name: 'Jose Atualizado',
          phone: '81988887777',
        }),
      }),
    );

    expect(prismaService.$transaction).toHaveBeenCalled();
    expect(prismaService.patient.updateMany).toHaveBeenCalledWith({
      where: { holderId: 'user-id', relationship: 'SELF', deletedAt: null },
      data: { name: 'Jose Atualizado' },
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('exige senha atual para alteração sensível', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'jose@exemplo.com',
      passwordHash: 'argon-hash',
    });

    await expect(
      usersService.updateMe('user-id', {
        email: 'novo@exemplo.com',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENT_PASSWORD_REQUIRED',
      },
    });

    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('recusa senha atual incorreta', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'jose@exemplo.com',
      passwordHash: 'argon-hash',
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      usersService.updateMe('user-id', {
        newPassword: 'NovaSenha123',
        currentPassword: 'SenhaErrada',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_CURRENT_PASSWORD',
      },
    });

    expect(prismaService.user.update).not.toHaveBeenCalled();
    expect(authSessionsService.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('recusa e-mail já cadastrado por outro usuário', async () => {
    prismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-id',
        email: 'jose@exemplo.com',
        passwordHash: 'argon-hash',
      })
      .mockResolvedValueOnce({
        id: 'other-user-id',
        email: 'novo@exemplo.com',
      });

    passwordHashService.verify.mockResolvedValue(true);

    await expect(
      usersService.updateMe('user-id', {
        email: 'novo@exemplo.com',
        currentPassword: 'Senha123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('troca a senha e revoga todas as sessões antigas', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'jose@exemplo.com',
      passwordHash: 'old-hash',
      status: UserStatus.ACTIVE,
    });

    passwordHashService.verify.mockResolvedValue(true);
    passwordHashService.hash.mockResolvedValue('new-hash');

    prismaService.user.update.mockResolvedValue({
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      id: 'user-id',
      name: 'Jose',
      email: 'jose@exemplo.com',
      phone: '81999999999',
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    authSessionsService.revokeAllForUser.mockResolvedValue(undefined);

    await usersService.updateMe('user-id', {
      currentPassword: 'Senha123',
      newPassword: 'NovaSenha123',
    });

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'old-hash',
      'Senha123',
    );

    expect(passwordHashService.hash).toHaveBeenCalledWith('NovaSenha123');

    expect(authSessionsService.revokeAllForUser).toHaveBeenCalledWith(
      'user-id',
      prismaService,
    );
  });

  it('não grava fora da transação e propaga falha da revogação para rollback', async () => {
    const user = {
      id: 'user-id',
      email: 'jose@exemplo.com',
      passwordHash: 'old-hash',
      status: UserStatus.ACTIVE,
    };
    prismaService.user.findUnique.mockResolvedValue(user);
    passwordHashService.verify.mockResolvedValue(true);
    passwordHashService.hash.mockResolvedValue('new-hash');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ id: user.id }),
      },
    };
    prismaService.$transaction.mockImplementation(async (work) => work(tx));
    authSessionsService.revokeAllForUser.mockRejectedValue(
      new Error('revocation failed'),
    );

    await expect(
      usersService.updateMe('user-id', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow('revocation failed');
    expect(tx.user.update).toHaveBeenCalled();
    expect(authSessionsService.revokeAllForUser).toHaveBeenCalledWith(
      'user-id',
      tx,
    );
    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('recusa credencial alterada enquanto a senha estava sendo verificada', async () => {
    prismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-id',
        email: 'jose@exemplo.com',
        passwordHash: 'old-hash',
        status: UserStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: 'user-id',
        email: 'jose@exemplo.com',
        passwordHash: 'changed-hash',
        status: UserStatus.ACTIVE,
      });
    passwordHashService.verify.mockResolvedValue(true);
    passwordHashService.hash.mockResolvedValue('new-hash');

    await expect(
      usersService.updateMe('user-id', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CURRENT_PASSWORD' } });
    expect(prismaService.user.update).not.toHaveBeenCalled();
    expect(authSessionsService.revokeAllForUser).not.toHaveBeenCalled();
  });
});
