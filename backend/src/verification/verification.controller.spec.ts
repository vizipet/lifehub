import {
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../generated/prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerificationController } from './verification.controller';

describe('VerificationController authorization', () => {
  const reflector = new Reflector();
  const rolesGuard = new RolesGuard(reflector);

  function makeContext(
    method: 'uploadDocument' | 'submit',
    role: UserRole,
  ): ExecutionContext {
    return {
      getHandler: () =>
        VerificationController.prototype[method],
      getClass: () => VerificationController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            role,
            sessionId: 'session-id',
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it.each([
    'uploadDocument',
    'submit',
  ] as const)(
    'recusa TUTOR no endpoint %s',
    (method) => {
      const context = makeContext(
        method,
        UserRole.PATIENT,
      );

      expect(() =>
        rolesGuard.canActivate(context),
      ).toThrow(ForbiddenException);
    },
  );

  it.each([
    'uploadDocument',
    'submit',
  ] as const)(
    'permite PROFESSIONAL no endpoint %s',
    (method) => {
      const context = makeContext(
        method,
        UserRole.PROFESSIONAL,
      );

      expect(
        rolesGuard.canActivate(context),
      ).toBe(true);
    },
  );
});
