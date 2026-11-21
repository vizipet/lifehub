import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthSessionsService } from './auth-sessions.service';
import { PasswordHashService } from './password-hash.service';

describe('AuthSessionsService', () => {
  let authSessionsService: AuthSessionsService;

  const prismaService = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    authSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaService.$transaction.mockImplementation(async (work) =>
      work(prismaService),
    );
    prismaService.$queryRaw.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthSessionsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: PasswordHashService,
          useValue: passwordHashService,
        },
      ],
    }).compile();

    authSessionsService = moduleRef.get(AuthSessionsService);
  });

  it('cria sessão somente com a credencial ainda válida dentro da transação', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      passwordHash: 'credential-hash',
    });
    passwordHashService.hash.mockResolvedValue('refresh-hash');
    const result = await authSessionsService.createSession(
      'user-id',
      'credential-hash',
    );
    expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaService.authSession.create).toHaveBeenCalledWith({
      data: {
        id: result.sessionId,
        userId: 'user-id',
        refreshTokenHash: 'refresh-hash',
        expiresAt: result.expiresAt,
      },
    });
  });

  it.each([
    { status: 'ACTIVE', passwordHash: 'changed-hash' },
    { status: 'DELETION_PENDING', passwordHash: 'credential-hash' },
  ])(
    'recusa login cuja conta mudou depois da verificação da senha %j',
    async (user) => {
      prismaService.user.findUnique.mockResolvedValue(user);
      passwordHashService.hash.mockResolvedValue('refresh-hash');
      await expect(
        authSessionsService.createSession('user-id', 'credential-hash'),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
    },
  );

  it('rotaciona refresh token válido e substitui o hash', async () => {
    const futureDate = new Date(Date.now() + 60_000);

    prismaService.authSession.findUnique.mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      refreshTokenHash: 'old-hash',
      expiresAt: futureDate,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-id',
        role: 'TUTOR',
        status: 'ACTIVE',
      },
    });

    passwordHashService.verify.mockResolvedValue(true);
    passwordHashService.hash.mockResolvedValue('new-hash');

    prismaService.authSession.updateMany.mockResolvedValue({ count: 1 });
    prismaService.authSession.update.mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      refreshTokenHash: 'new-hash',
      expiresAt: futureDate,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-id',
        role: 'TUTOR',
        status: 'ACTIVE',
      },
    });

    const result = await authSessionsService.rotateSession(
      'session-id.old-secret',
    );

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'old-hash',
      'session-id.old-secret',
    );

    expect(passwordHashService.hash).toHaveBeenCalled();

    expect(prismaService.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'session-id',
          refreshTokenHash: 'old-hash',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          user: { status: 'ACTIVE' },
        },
        data: expect.objectContaining({
          refreshTokenHash: 'new-hash',
        }),
      }),
    );

    expect(result.refreshToken).not.toBe('session-id.old-secret');
  });

  it('recusa reutilização de refresh token antigo', async () => {
    const futureDate = new Date(Date.now() + 60_000);

    prismaService.authSession.findUnique.mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      refreshTokenHash: 'new-hash',
      expiresAt: futureDate,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-id',
        role: 'TUTOR',
        status: 'ACTIVE',
      },
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      authSessionsService.rotateSession('session-id.old-secret'),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Sessão inválida ou expirada.',
      },
    });

    expect(prismaService.authSession.update).not.toHaveBeenCalled();
  });

  it('revoga sessão no logout', async () => {
    const futureDate = new Date(Date.now() + 60_000);

    prismaService.authSession.findUnique.mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      refreshTokenHash: 'refresh-hash',
      expiresAt: futureDate,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    passwordHashService.verify.mockResolvedValue(true);

    prismaService.authSession.update.mockResolvedValue({
      id: 'session-id',
    });

    await authSessionsService.revokeSession('session-id.refresh-secret');

    expect(prismaService.authSession.update).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('revoga todas as sessões ativas do usuário', async () => {
    prismaService.authSession.updateMany.mockResolvedValue({
      count: 2,
    });

    await authSessionsService.revokeAllForUser('user-id');

    expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('aceita somente uma renovação concorrente do mesmo token antigo', async () => {
    prismaService.authSession.findUnique.mockResolvedValue({
      id: 'session-id',
      refreshTokenHash: 'old-hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: 'ACTIVE' },
    });
    passwordHashService.verify.mockResolvedValue(true);
    let nextHash = 0;
    passwordHashService.hash.mockImplementation(
      async () => `new-hash-${++nextHash}`,
    );
    let storedHash = 'old-hash';
    prismaService.authSession.updateMany.mockImplementation(
      async ({ where, data }) => {
        if (where.refreshTokenHash !== storedHash) return { count: 0 };
        storedHash = data.refreshTokenHash;
        return { count: 1 };
      },
    );

    const results = await Promise.allSettled([
      authSessionsService.rotateSession('session-id.old-secret'),
      authSessionsService.rotateSession('session-id.old-secret'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { response: { code: 'INVALID_REFRESH_TOKEN' } },
    });
    expect(prismaService.authSession.update).not.toHaveBeenCalled();
  });

  it('recusa renovação quando a sessão é revogada ou expira após a verificação', async () => {
    prismaService.authSession.findUnique.mockResolvedValue({
      id: 'session-id',
      refreshTokenHash: 'old-hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: 'ACTIVE' },
    });
    passwordHashService.verify.mockResolvedValue(true);
    passwordHashService.hash.mockResolvedValue('new-hash');
    prismaService.authSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      authSessionsService.rotateSession('session-id.old-secret'),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });
    expect(prismaService.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it('aceita sessão ativa e não expirada', async () => {
    prismaService.authSession.findFirst.mockResolvedValue({
      id: 'session-id',
    });

    await expect(
      authSessionsService.assertSessionActive('session-id', 'user-id'),
    ).resolves.toBeUndefined();

    expect(prismaService.authSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        userId: 'user-id',
        revokedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('recusa sessão revogada, expirada ou inexistente', async () => {
    prismaService.authSession.findFirst.mockResolvedValue(null);

    await expect(
      authSessionsService.assertSessionActive('session-id', 'user-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
