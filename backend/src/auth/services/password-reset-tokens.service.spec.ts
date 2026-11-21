import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordResetTokensService } from './password-reset-tokens.service';

describe('PasswordResetTokensService', () => {
  let service: PasswordResetTokensService;

  const prisma = {
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetTokensService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(PasswordResetTokensService);
  });

  it('cria token e salva somente o hash com validade de 30 minutos', async () => {
    prisma.passwordResetToken.create.mockResolvedValue({});

    const before = Date.now();

    const token = await service.createToken('user-id');

    const after = Date.now();

    expect(token).toBeTruthy();

    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);

    const createCall =
      prisma.passwordResetToken.create.mock.calls[0][0];

    expect(createCall.data.userId).toBe('user-id');

    expect(createCall.data.tokenHash).not.toBe(token);

    expect(createCall.data.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 30 * 60 * 1000,
    );

    expect(createCall.data.expiresAt.getTime()).toBeLessThanOrEqual(
      after + 30 * 60 * 1000,
    );
  });

  it('consome token válido uma única vez', async () => {
    prisma.passwordResetToken.create.mockResolvedValue({});

    const token = await service.createToken('user-id');

    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-id',
      userId: 'user-id',
    });

    prisma.passwordResetToken.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(service.consumeToken(token)).resolves.toBe(
      'user-id',
    );

    expect(
      prisma.passwordResetToken.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'reset-id',
        usedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
  });

  it('recusa token expirado', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-id',
      userId: 'user-id',
    });

    prisma.passwordResetToken.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.consumeToken('expired-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(
      prisma.passwordResetToken.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('recusa token já utilizado', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-id',
      userId: 'user-id',
    });

    prisma.passwordResetToken.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.consumeToken('used-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(
      prisma.passwordResetToken.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('recusa token inexistente', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      service.consumeToken('invalid-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(
      prisma.passwordResetToken.updateMany,
    ).not.toHaveBeenCalled();
  });
});