import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let app: INestApplication;

  const authService = {
    registerPatient: jest.fn(),
    registerProfessional: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recusa senha com menos de 8 caracteres', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Jose Teste',
        email: 'jose@vizipet.local',
        phone: '81999999999',
        password: '123',
      })
      .expect(400);

    expect(authService.registerPatient).not.toHaveBeenCalled();
  });

  it('recusa tentativa de enviar role ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Admin Teste',
        email: 'admin@vizipet.local',
        phone: '81999999999',
        password: 'Senha123',
        role: 'ADMIN',
      })
      .expect(400);

    expect(response.body.message).toContain('property role should not exist');
    expect(authService.registerPatient).not.toHaveBeenCalled();
  });
  it('processa solicitação de recuperação de senha com 204', async () => {
    authService.requestPasswordReset.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({
        email: 'jose@vizipet.local',
      })
      .expect(204);

    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'jose@vizipet.local',
    );
  });

  it('redefine senha com 204', async () => {
    authService.resetPassword.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({
        token: 'reset-token',
        newPassword: 'NovaSenha123',
      })
      .expect(204);

    expect(authService.resetPassword).toHaveBeenCalledWith(
      'reset-token',
      'NovaSenha123',
    );
  });
});