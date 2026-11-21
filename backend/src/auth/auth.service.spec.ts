import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthSessionsService } from './services/auth-sessions.service';
import { PasswordHashService } from './services/password-hash.service';
import { PasswordResetFlowService } from './services/password-reset-flow.service';

describe('AuthService', () => {
  let authService: AuthService;

  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByLogin: jest.fn(),
    registerFailedLogin: jest.fn(),
    clearFailedLogins: jest.fn(),
    updatePasswordHash: jest.fn(),
  };

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const jwtService = {
    signAsync: jest.fn(),
  };

  const authSessionsService = {
    createSession: jest.fn(),
    rotateSession: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  const passwordResetFlow = {
    request: jest.fn(),
    confirm: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: PasswordHashService,
          useValue: passwordHashService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: AuthSessionsService,
          useValue: authSessionsService,
        },
        {
          provide: PasswordResetFlowService,
          useValue: passwordResetFlow,
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  it('cadastra paciente sem retornar passwordHash nem CPF', async () => {
    passwordHashService.hash.mockResolvedValue('argon-hash');

    usersService.create.mockResolvedValue({
      id: 'user-id',
      name: 'Jose Teste',
      email: 'jose@lifehub.local',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      failedLoginCount: 0,
      lockedUntil: null,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authService.registerPatient({
      name: 'Jose Teste',
      email: 'jose@lifehub.local',
      phone: '81999999999',
      cpf: '52998224725',
      birthDate: '1990-05-10',
      password: 'Senha123',
      acceptTerms: true,
      acceptPrivacyPolicy: true,
      acceptHealthData: true,
    });

    expect(passwordHashService.hash).toHaveBeenCalledWith('Senha123');

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRole.PATIENT,
        passwordHash: 'argon-hash',
      }),
    );

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('cpfEncrypted');
    expect(result.cpfMasked).toBe('•••.•••.•••-25');
    expect(result.role).toBe(UserRole.PATIENT);
  });

  it('força PROFESSIONAL no cadastro profissional', async () => {
    passwordHashService.hash.mockResolvedValue('argon-hash');

    usersService.create.mockResolvedValue({
      id: 'professional-id',
      name: 'Profissional Teste',
      email: 'profissional@lifehub.local',
      phone: '81955555555',
      passwordHash: 'argon-hash',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      failedLoginCount: 0,
      lockedUntil: null,
      role: UserRole.PROFESSIONAL,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authService.registerProfessional({
      name: 'Profissional Teste',
      email: 'profissional@lifehub.local',
      phone: '81955555555',
      cpf: '52998224725',
      birthDate: '1990-05-10',
      password: 'Senha123',
      acceptTerms: true,
      acceptPrivacyPolicy: true,
      acceptHealthData: true,
    });

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRole.PROFESSIONAL,
      }),
    );

    expect(result.role).toBe(UserRole.PROFESSIONAL);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('realiza login correto e retorna tokens', async () => {
    usersService.findByLogin.mockResolvedValue({
      id: 'user-id',
      name: 'Jose Teste',
      email: 'jose@lifehub.local',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      failedLoginCount: 0,
      lockedUntil: null,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    passwordHashService.verify.mockResolvedValue(true);

    authSessionsService.createSession.mockResolvedValue({
      sessionId: 'session-id',
      refreshToken: 'session-id.refresh-secret',
      expiresAt: new Date(),
    });

    jwtService.signAsync.mockResolvedValue('access-token');

    const result = await authService.login({
      login: 'jose@lifehub.local',
      password: 'Senha123',
    });

    expect(usersService.findByLogin).toHaveBeenCalledWith('jose@lifehub.local');

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'argon-hash',
      'Senha123',
    );

    expect(authSessionsService.createSession).toHaveBeenCalledWith(
      'user-id',
      'argon-hash',
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      role: UserRole.PATIENT,
      type: 'access',
      sid: 'session-id',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('session-id.refresh-secret');
    expect(result.expiresIn).toBe(900);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('recusa senha incorreta com mensagem neutra', async () => {
    usersService.findByLogin.mockResolvedValue({
      id: 'user-id',
      name: 'Jose Teste',
      email: 'jose@lifehub.local',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      failedLoginCount: 0,
      lockedUntil: null,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      authService.login({
        login: 'jose@lifehub.local',
        password: 'SenhaErrada',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail/CPF ou senha inválidos.',
      },
    });

    expect(usersService.registerFailedLogin).toHaveBeenCalledWith('user-id');
    expect(authSessionsService.createSession).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('recusa conta temporariamente bloqueada por tentativas, sem checar a senha', async () => {
    usersService.findByLogin.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'argon-hash',
      status: UserStatus.ACTIVE,
      failedLoginCount: 0,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    await expect(
      authService.login({ login: 'jose@lifehub.local', password: 'Senha123' }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_TEMPORARILY_LOCKED' } });
    expect(passwordHashService.verify).not.toHaveBeenCalled();
  });

  it('recusa e-mail inexistente com a mesma mensagem', async () => {
    usersService.findByLogin.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('dummy-hash');
    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      authService.login({
        login: 'naoexiste@lifehub.local',
        password: 'Senha123',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail/CPF ou senha inválidos.',
      },
    });

    // Mesmo sem conta, uma verificação é feita para não revelar quem existe pelo tempo.
    expect(passwordHashService.verify).toHaveBeenCalledTimes(1);
    expect(authSessionsService.createSession).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('recusa usuário bloqueado', async () => {
    usersService.findByLogin.mockResolvedValue({
      id: 'user-id',
      name: 'Jose Teste',
      email: 'jose@lifehub.local',
      phone: '81999999999',
      passwordHash: 'argon-hash',
      birthDate: new Date('1990-05-10T00:00:00Z'),
      cpfLast2: '25',
      failedLoginCount: 0,
      lockedUntil: null,
      role: UserRole.PATIENT,
      status: UserStatus.BLOCKED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    passwordHashService.verify.mockResolvedValue(true);

    await expect(
      authService.login({
        login: 'jose@lifehub.local',
        password: 'Senha123',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Esta conta não está disponível para acesso.',
      },
    });

    expect(authSessionsService.createSession).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
  it('renova tokens com refresh válido', async () => {
    authSessionsService.rotateSession.mockResolvedValue({
      session: {
        id: 'session-id',
        user: {
          id: 'user-id',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
        },
      },
      refreshToken: 'session-id.new-refresh-secret',
    });

    jwtService.signAsync.mockResolvedValue('new-access-token');

    const result = await authService.refresh('session-id.old-refresh-secret');

    expect(authSessionsService.rotateSession).toHaveBeenCalledWith(
      'session-id.old-refresh-secret',
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      role: UserRole.PATIENT,
      type: 'access',
      sid: 'session-id',
    });

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'session-id.new-refresh-secret',
      expiresIn: 900,
    });
  });

  it('encerra sessão no logout', async () => {
    authSessionsService.revokeSession.mockResolvedValue(undefined);

    await authService.logout('session-id.refresh-secret');

    expect(authSessionsService.revokeSession).toHaveBeenCalledWith(
      'session-id.refresh-secret',
    );
  });

  it('delega solicitação à integração transacional sem retornar token', async () => {
    passwordResetFlow.request.mockResolvedValue(undefined);
    await expect(
      authService.requestPasswordReset('jose@lifehub.local'),
    ).resolves.toBeUndefined();
    expect(passwordResetFlow.request).toHaveBeenCalledWith(
      'jose@lifehub.local',
    );
  });

  it('delega confirmação preservando o contrato público', async () => {
    passwordResetFlow.confirm.mockResolvedValue(undefined);
    await expect(
      authService.resetPassword('reset-token', 'NovaSenha123'),
    ).resolves.toBeUndefined();
    expect(passwordResetFlow.confirm).toHaveBeenCalledWith(
      'reset-token',
      'NovaSenha123',
    );
  });
});
