import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

describe('PrivacyController', () => {
  let app: INestApplication<App>;

  const privacyService = {
    requestAccountDeletion: jest.fn(),
    getNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
    exportUserData: jest.fn(),
    registerLegalAcceptance: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        {
          provide: PrivacyService,
          useValue: privacyService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              user?: {
                id: string;
                role: string;
              };
            };
          };
        }) => {
          const request = context.switchToHttp().getRequest();

          request.user = {
            id: 'user-id',
            role: 'PATIENT',
          };

          return true;
        },
      })
      .overrideGuard(ActiveUserGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejeita solicitação de exclusão sem senha', async () => {
    await request(app.getHttpServer())
      .post('/privacy/account-deletion')
      .send({})
      .expect(400);

    expect(privacyService.requestAccountDeletion).not.toHaveBeenCalled();
  });
});
