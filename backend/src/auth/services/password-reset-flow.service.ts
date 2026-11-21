import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PasswordResetEnvelope,
  PASSWORD_RESET_REQUESTED,
  resetContext,
  resetDigest,
} from '../../common/security/password-reset-envelope';
import { UserStatus } from '../../generated/prisma/client';
import { UsersService } from '../../users/users.service';
import {
  OUTBOX_CONTRACT,
  type OutboxContract,
  type TransactionClient,
} from '../contracts/outbox.contract';
import { AuthSessionsService } from './auth-sessions.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordResetTokensService } from './password-reset-tokens.service';

@Injectable()
export class PasswordResetFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: PasswordResetTokensService,
    private readonly users: UsersService,
    private readonly passwords: PasswordHashService,
    private readonly sessions: AuthSessionsService,
    private readonly envelope: PasswordResetEnvelope,
    @Inject(OUTBOX_CONTRACT) private readonly outbox: OutboxContract,
  ) {}

  async request(email: string): Promise<void> {
    const deadline = performance.now() + 200 + randomInt(26);
    try {
      await this.enqueue(email);
    } finally {
      await delay(Math.max(0, deadline - performance.now()));
    }
  }

  private async enqueue(email: string): Promise<void> {
    // Configuration errors have the same response for existing and unknown accounts.
    this.envelope.assertConfigured();
    const candidate = await this.users.findByEmail(email);
    if (!candidate) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: candidate.id } });
      if (
        !user ||
        user.status !== UserStatus.ACTIVE ||
        user.email !== email.trim().toLowerCase()
      )
        return;
      // Account row lock makes this cooldown effective across concurrent app instances.
      const recent = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        const previous = await tx.outboxEvent.findFirst({
          where: {
            type: PASSWORD_RESET_REQUESTED,
            payload: { path: ['tokenId'], equals: recent.id },
          },
          select: { payload: true },
        });
        if (previous) {
          let context;
          try {
            context = resetContext(previous.payload);
          } catch {
            /* A malformed event cannot suppress recovery. */
          }
          if (
            context?.emailHash === resetDigest(user.email) &&
            context.credentialHash === resetDigest(user.passwordHash)
          )
            return;
        }
      }
      const token = await this.tokens.createToken(user.id, tx);
      const stored = await tx.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: resetDigest(token) },
      });
      const payload = this.envelope.seal(token, {
        version: 1,
        tokenId: stored.id,
        userId: user.id,
        emailHash: resetDigest(user.email),
        credentialHash: resetDigest(user.passwordHash),
      });
      await this.outbox.emitOutbox(
        { type: PASSWORD_RESET_REQUESTED, payload },
        tx as unknown as TransactionClient,
      );
    });
  }

  async confirm(token: string, newPassword: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{64}$/.test(token)) throw this.invalid();
    const candidate = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: resetDigest(token) },
    });
    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date())
      throw this.invalid();
    // Hash before opening the transaction; failures cannot consume the reset token.
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: candidate.userId },
      });
      const event = await tx.outboxEvent.findFirst({
        where: {
          type: PASSWORD_RESET_REQUESTED,
          payload: { path: ['tokenId'], equals: candidate.id },
        },
        select: { payload: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE || !event)
        throw this.invalid();
      let context;
      try {
        context = resetContext(event.payload);
      } catch {
        throw this.invalid();
      }
      if (
        context.userId !== user.id ||
        context.emailHash !== resetDigest(user.email) ||
        context.credentialHash !== resetDigest(user.passwordHash)
      )
        throw this.invalid();
      const userId = await this.tokens.consumeToken(token, tx);
      await this.users.updatePasswordHash(userId, passwordHash, tx);
      await this.sessions.revokeAllForUser(userId, tx);
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_PASSWORD_RESET_TOKEN',
      message: 'Token de recuperação inválido ou expirado.',
    });
  }
}
