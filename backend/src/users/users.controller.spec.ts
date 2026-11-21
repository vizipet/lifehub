import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../generated/prisma/client';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    request.user = {
      id: 'user-id',
      role: UserRole.PATIENT,
      sessionId: 'session-id',
    };

    return true;
  }
}

class TestActiveUserGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('UsersController', () => {
  let app: INestApplication;

    const usersService = {
    findPublicById: jest.fn(),
    updateMe: jest.fn(),
    };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .overrideGuard(ActiveUserGuard)
      .useClass(TestActiveUserGuard)
      .compile();

    app = moduleRef.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna os dados da conta autenticada sem passwordHash', async () => {
    usersService.findPublicById.mockResolvedValue({
      id: 'user-id',
      name: 'Jose Teste',
      email: 'jose@vizipet.local',
      phone: '81999999999',
      role: UserRole.PATIENT,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app.getHttpServer())
      .get('/users/me')
      .expect(200);

    expect(usersService.findPublicById).toHaveBeenCalledWith(
      'user-id',
    );

    expect(response.body.data.id).toBe('user-id');
    expect(response.body.data.email).toBe(
      'jose@vizipet.local',
    );
    expect(response.body.data).not.toHaveProperty(
      'passwordHash',
    );
  });

  it('atualiza a conta autenticada', async () => {
    usersService.updateMe.mockResolvedValue({
        id: 'user-id',
        name: 'Jose Atualizado',
        email: 'jose@vizipet.local',
        phone: '81988887777',
        role: UserRole.PATIENT,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const response = await request(app.getHttpServer())
        .patch('/users/me')
        .send({
        name: 'Jose Atualizado',
        phone: '81988887777',
        })
        .expect(200);

    expect(usersService.updateMe).toHaveBeenCalledWith(
        'user-id',
        {
        name: 'Jose Atualizado',
        phone: '81988887777',
        },
    );

    expect(response.body.data.name).toBe(
        'Jose Atualizado',
    );

    expect(response.body.data).not.toHaveProperty(
        'passwordHash',
    );
    });
});