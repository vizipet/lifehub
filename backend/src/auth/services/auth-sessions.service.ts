import type { Prisma } from '../../generated/prisma/client';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordHashService } from './password-hash.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async createSession(userId: string, expectedPasswordHash: string) {
    const sessionId = randomUUID();
    const refreshToken = this.generateRefreshToken(sessionId);

    const refreshTokenHash = await this.passwordHashService.hash(refreshToken);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      // Order session creation with password changes/recovery and account deletion.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, passwordHash: true },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.passwordHash !== expectedPasswordHash
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'E-mail ou senha inválidos.',
        });
      }
      await tx.authSession.create({
        data: { id: sessionId, userId, refreshTokenHash, expiresAt },
      });
    });

    return {
      sessionId,
      refreshToken,
      expiresAt,
    };
  }

  async rotateSession(refreshToken: string) {
    const sessionId = this.extractSessionId(refreshToken);

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        user: true,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw this.invalidRefreshToken();
    }

    const tokenMatches = await this.passwordHashService.verify(
      session.refreshTokenHash,
      refreshToken,
    );

    if (!tokenMatches) {
      throw this.invalidRefreshToken();
    }

    const newRefreshToken = this.generateRefreshToken(session.id);
    const newRefreshTokenHash =
      await this.passwordHashService.hash(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    if (rotated.count !== 1) {
      throw this.invalidRefreshToken();
    }

    return {
      session: {
        ...session,
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
      },
      refreshToken: newRefreshToken,
    };
  }

  async revokeSession(refreshToken: string) {
    const sessionId = this.extractSessionId(refreshToken);

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw this.invalidRefreshToken();
    }

    const tokenMatches = await this.passwordHashService.verify(
      session.refreshTokenHash,
      refreshToken,
    );

    if (!tokenMatches) {
      throw this.invalidRefreshToken();
    }

    await this.prisma.authSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async assertSessionActive(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      throw this.invalidRefreshToken();
    }
  }

  async revokeAllForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
  private generateRefreshToken(sessionId: string): string {
    const secret = randomBytes(48).toString('base64url');

    return `${sessionId}.${secret}`;
  }

  private extractSessionId(refreshToken: string): string {
    const separatorIndex = refreshToken.indexOf('.');

    if (separatorIndex <= 0) {
      throw this.invalidRefreshToken();
    }

    return refreshToken.slice(0, separatorIndex);
  }

  private invalidRefreshToken() {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Sessão inválida ou expirada.',
    });
  }
}
