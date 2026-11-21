import { ACCOUNT_DELETION_REQUESTED } from '../privacy/account-deletion.event';
import { Injectable, Optional } from '@nestjs/common';
import { PASSWORD_RESET_REQUESTED } from '../common/security/password-reset-envelope';
import { PasswordResetEmailService } from './password-reset-email.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { OutboxStatus } from '../generated/prisma/client';
import { calculateNextOutboxAttempt } from './outbox-retry.policy';
import { NotificationsService } from './notifications.service';
import { NotificationEmailService } from './notification-email.service';
import { NotificationSkippedError } from './notification-skipped.error';
import { OutboxRunLeaseLostError } from './outbox-run-guard';
import type { OutboxRunGuard } from './outbox-run-guard';

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;
const PROCESSING_TIMEOUT_MS = 15 * 60_000;

@Injectable()
export class OutboxProcessorService {
 constructor(
  private readonly prisma: PrismaService,
  private readonly notificationsService: NotificationsService,
  private readonly notificationEmailService: NotificationEmailService,
  @Optional() private readonly passwordResetEmail?: PasswordResetEmailService,
) {}

  async claimPendingBatch(limit = DEFAULT_BATCH_SIZE) {
    const take = this.normalizeLimit(limit);
    const now = new Date();

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        status: OutboxStatus.PENDING,
        OR: [
          {
            nextAttemptAt: null,
          },
          {
            nextAttemptAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });

    const claimed: typeof candidates = [];

    for (const candidate of candidates) {
      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          type: { not: ACCOUNT_DELETION_REQUESTED },
          id: candidate.id,
          status: OutboxStatus.PENDING,
          OR: [
            {
              nextAttemptAt: null,
            },
            {
              nextAttemptAt: {
                lte: now,
              },
            },
          ],
        },
        data: {
          status: OutboxStatus.PROCESSING,
          attemptCount: {
            increment: 1,
          },
          nextAttemptAt: null,
          processingStartedAt: now,
          lastError: null,
        },
      });

      if (result.count !== 1) {
        continue;
      }

      claimed.push(
        await this.prisma.outboxEvent.findUniqueOrThrow({
          where: {
            id: candidate.id,
          },
        }),
      );
    }

    return claimed;
  }
async processClaimedEvent(event: {
  id: string;
  type: string;
  payload: unknown;
  attemptCount: number;
}, assertLease?: OutboxRunGuard) {
  await assertLease?.();
  // Ownership belongs to a future privacy consumer; do not mark this task as delivered/failed.
  if (event.type === ACCOUNT_DELETION_REQUESTED) return false;
  if (event.type === PASSWORD_RESET_REQUESTED) {
    if (!this.passwordResetEmail) throw new Error('RESET_DELIVERY_UNAVAILABLE');
    if (!await this.passwordResetEmail.send(event, assertLease)) return false;
    await assertLease?.();
    return this.finishClaimedEvent(event);
  }
  const notification = await this.notificationsService.createFromOutboxEvent(event)
    .catch((error: unknown) => {
      if (error instanceof NotificationSkippedError) return null;
      throw error;
    });
  if (notification === null) {
    await assertLease?.();
    return this.finishClaimedEvent(event);
  }

  await assertLease?.();
  await this.notificationEmailService.sendForNotification(
    notification.id,
  );

  await assertLease?.();
  return this.finishClaimedEvent(event);
}

private async finishClaimedEvent(event: { id: string; attemptCount: number }) {
  const processedAt = new Date();

  const result = await this.prisma.outboxEvent.updateMany({
    where: {
  type: { not: ACCOUNT_DELETION_REQUESTED },
  id: event.id,
  status: OutboxStatus.PROCESSING,
  attemptCount: event.attemptCount,
},
    data: {
      status: OutboxStatus.PROCESSED,
      processedAt,
      processingStartedAt: null,
      nextAttemptAt: null,
      lastError: null,
    },
  });

  return result.count === 1;
}

async processBatch(limit = DEFAULT_BATCH_SIZE, assertLease?: OutboxRunGuard) {
  await assertLease?.();
  await this.recoverStaleProcessingEvents(limit);

  await assertLease?.();
  const claimed = await this.claimPendingBatch(limit);

  let processed = 0;

  for (const event of claimed) {
  await assertLease?.();
  try {
    const success = await this.processClaimedEvent(event, assertLease);

    if (success) {
      processed += 1;
    }
  } catch (error) {
    // Ownership loss stops the batch; it is not a provider failure or a retry request.
    if (error instanceof OutboxRunLeaseLostError) throw error;
    await this.markProcessingFailure(event);
  }
}

  return {
    claimed: claimed.length,
    processed,
  };
}
async markProcessingFailure(event: {
  id: string;
  attemptCount: number;
}): Promise<boolean> {
  const now = new Date();

  const nextAttemptAt = calculateNextOutboxAttempt(
    event.attemptCount,
    now,
  );

  const nextStatus =
    nextAttemptAt === null
      ? OutboxStatus.FAILED
      : OutboxStatus.PENDING;

  const result = await this.prisma.outboxEvent.updateMany({
    where: {
      type: { not: ACCOUNT_DELETION_REQUESTED },
      id: event.id,
      status: OutboxStatus.PROCESSING,
      attemptCount: event.attemptCount,
    },
    data: {
      status: nextStatus,
      nextAttemptAt,
      processingStartedAt: null,
      processedAt: null,
      lastError: 'NOTIFICATION_DELIVERY_FAILED',
    },
  });

  return result.count === 1;
}
  async recoverStaleProcessingEvents(limit = DEFAULT_BATCH_SIZE) {
    const take = this.normalizeLimit(limit);
    const now = new Date();

    const staleBefore = new Date(
      now.getTime() - PROCESSING_TIMEOUT_MS,
    );

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        status: OutboxStatus.PROCESSING,
        processingStartedAt: {
          lte: staleBefore,
        },
      },
      orderBy: [
        { processingStartedAt: 'asc' },
        { id: 'asc' },
      ],
      take,
    });

    let recovered = 0;
    let failed = 0;

    for (const event of candidates) {
      const nextAttemptAt = calculateNextOutboxAttempt(
        event.attemptCount,
        now,
      );

      const shouldFail = nextAttemptAt === null;

      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          type: { not: ACCOUNT_DELETION_REQUESTED },
          id: event.id,
          status: OutboxStatus.PROCESSING,
          attemptCount: event.attemptCount,
          processingStartedAt: event.processingStartedAt,
        },
        data: {
          status: shouldFail
            ? OutboxStatus.FAILED
            : OutboxStatus.PENDING,
          nextAttemptAt,
          processingStartedAt: null,
          processedAt: null,
          lastError: 'OUTBOX_PROCESSING_TIMEOUT',
        },
      });

      if (result.count !== 1) {
        continue;
      }

      if (shouldFail) {
        failed += 1;
      } else {
        recovered += 1;
      }
    }

    return {
      recovered,
      failed,
    };
  }
  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return DEFAULT_BATCH_SIZE;
    }

    return Math.min(
      MAX_BATCH_SIZE,
      Math.max(1, Math.trunc(limit)),
    );
  }
}
