import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthSessionsService } from '../services/auth-sessions.service';
import { UsersService } from '../../users/users.service';
import { ActiveUserGuard } from './active-user.guard';

describe('ActiveUserGuard', () => {
  let guard: ActiveUserGuard;

  const usersService = {
    assertUserActive: jest.fn(),
  };

  const authSessionsService = {
    assertSessionActive: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ActiveUserGuard,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: AuthSessionsService,
          useValue: authSessionsService,
        },
      ],
    }).compile();

    guard = moduleRef.get(ActiveUserGuard);
  });

  it('permite usuário ativo com sessão ativa', async () => {
    usersService.assertUserActive.mockResolvedValue(undefined);
    authSessionsService.assertSessionActive.mockResolvedValue(
      undefined,
    );

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role: 'TUTOR',
            sessionId: 'session-id',
          },
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(usersService.assertUserActive).toHaveBeenCalledWith(
      'user-id',
    );

    expect(
      authSessionsService.assertSessionActive,
    ).toHaveBeenCalledWith('session-id', 'user-id');
  });

  it('recusa conta bloqueada', async () => {
    usersService.assertUserActive.mockRejectedValue(
      new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Esta conta não está disponível para acesso.',
      }),
    );

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role: 'TUTOR',
            sessionId: 'session-id',
          },
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(
      authSessionsService.assertSessionActive,
    ).not.toHaveBeenCalled();
  });

  it('recusa sessão revogada ou expirada', async () => {
    usersService.assertUserActive.mockResolvedValue(undefined);

    authSessionsService.assertSessionActive.mockRejectedValue(
      new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Sessão inválida ou expirada.',
      }),
    );

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role: 'TUTOR',
            sessionId: 'session-id',
          },
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(usersService.assertUserActive).toHaveBeenCalledWith(
      'user-id',
    );

    expect(
      authSessionsService.assertSessionActive,
    ).toHaveBeenCalledWith('session-id', 'user-id');
  });
});