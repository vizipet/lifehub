import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  PasswordResetEnvelope,
  PASSWORD_RESET_REQUESTED,
  resetContext,
  resetDigest,
} from '../common/security/password-reset-envelope';
import { OutboxStatus, UserStatus } from '../generated/prisma/client';
import {
  NOTIFICATION_EMAIL_SENDER,
  type NotificationEmailSender,
} from './notification-email.contract';
import type { OutboxRunGuard } from './outbox-run-guard';

@Injectable()
export class PasswordResetEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly envelope: PasswordResetEnvelope,
    @Inject(NOTIFICATION_EMAIL_SENDER)
    private readonly sender: NotificationEmailSender,
  ) {}

  async send(
    event: { id: string; attemptCount: number },
    assertLease?: OutboxRunGuard,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize delivery of this claim, including concurrent replay by an old worker.
        await tx.$queryRaw`SELECT id FROM outbox_events WHERE id = ${event.id}::uuid FOR UPDATE`;
        const current = await tx.outboxEvent.findUnique({
          where: { id: event.id },
        });
        if (
          !current ||
          current.type !== PASSWORD_RESET_REQUESTED ||
          current.status !== OutboxStatus.PROCESSING ||
          current.attemptCount !== event.attemptCount
        )
          return false;
        const context = resetContext(current.payload);
        const payload = current.payload as Record<string, unknown>;
        if (payload.delivery === 'sent' || payload.delivery === 'skipped')
          return true;
        const stored = await tx.passwordResetToken.findUnique({
          where: { id: context.tokenId },
          include: { user: { include: { notificationPreference: true } } },
        });
        const eligible =
          stored &&
          stored.userId === context.userId &&
          !stored.usedAt &&
          stored.expiresAt > new Date() &&
          stored.user.status === UserStatus.ACTIVE &&
          stored.user.notificationPreference?.emailEnabled !== false &&
          resetDigest(stored.user.email) === context.emailHash &&
          resetDigest(stored.user.passwordHash) === context.credentialHash;
        if (eligible) {
          const token = this.envelope.open(current.payload);
          if (resetDigest(token) !== stored.tokenHash)
            throw new Error('INVALID_RESET_EVENT');
          await assertLease?.();
          await this.sender.send({
            to: stored.user.email,
            subject: 'LifeHub — Recuperação de senha',
            text: [
              'Você solicitou a recuperação de senha do LifeHub.',
              '',
              'Abra o link abaixo para criar uma nova senha:',
              // O token vai no fragmento (#): não é enviado a servidores nem fica em logs de acesso.
              `${(process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/reset-password#token=${encodeURIComponent(token)}`,
              '',
              'O link vale por 30 minutos e só pode ser usado uma vez.',
              'Se você não pediu a recuperação, ignore esta mensagem: sua senha continua a mesma.',
            ].join('\n'),
            idempotencyKey: `password-reset:${context.tokenId}`,
          });
        }
        // The delivery receipt survives a worker crash before the generic completion step.
        // Retain only non-reversible context; never create an API-readable Notification with this token.
        await tx.outboxEvent.update({
          where: { id: current.id },
          data: {
            payload: {
              ...context,
              delivery: eligible ? 'sent' : 'skipped',
            },
          },
        });
        return true;
      },
      { timeout: 15_000 },
    );
  }
}
