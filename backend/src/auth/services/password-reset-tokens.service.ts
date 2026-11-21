import type { Prisma } from '../../generated/prisma/client';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class PasswordResetTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createToken(userId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(token);

    await (tx ?? this.prisma).passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    return token;
  }

    async consumeToken(token: string, tx?: Prisma.TransactionClient): Promise<string> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const resetToken = await (tx ?? this.prisma).passwordResetToken.findUnique({
        where: {
        tokenHash,
        },
        select: {
        id: true,
        userId: true,
        },
    });

    if (!resetToken) {
        throw this.invalidResetToken();
    }

    const result = await (tx ?? this.prisma).passwordResetToken.updateMany({
        where: {
        id: resetToken.id,
        usedAt: null,
        expiresAt: {
            gt: now,
        },
        },
        data: {
        usedAt: now,
        },
    });

    if (result.count !== 1) {
        throw this.invalidResetToken();
    }

    return resetToken.userId;
    }
    private invalidResetToken(): UnauthorizedException {
    return new UnauthorizedException({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'Token de recuperação inválido ou expirado.',
    });
    }
}