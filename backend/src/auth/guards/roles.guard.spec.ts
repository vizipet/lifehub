import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    rolesGuard = moduleRef.get(RolesGuard);
    reflector = moduleRef.get(Reflector);
  });

  it('permite acesso quando não há papel obrigatório', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(),
    } as any;

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('permite acesso quando usuário possui o papel exigido', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role: UserRole.ADMIN,
            sessionId: 'session-id',
          },
        }),
      }),
    } as any;

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('recusa usuário com papel incorreto', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role: UserRole.PATIENT,
            sessionId: 'session-id',
          },
        }),
      }),
    } as any;

    expect(() => rolesGuard.canActivate(context)).toThrow(
      ForbiddenException,
    );
  });
});