import { Injectable } from '@nestjs/common';
import { ACCOUNT_DELETION_REQUESTED } from '../privacy/account-deletion.event';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { OutboxStatus } from '../generated/prisma/client';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxRunLeaseService } from './outbox-run-lease.service';
import { OutboxRunLeaseLostError } from './outbox-run-guard';

@Injectable()
export class OutboxJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: OutboxProcessorService,
    private readonly leases: OutboxRunLeaseService,
  ) {}

  async runBatch(batchSize: number) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
      throw new Error('INVALID_OUTBOX_JOB_BATCH');
    }
    const ownerId = randomUUID();
    if (!await this.leases.acquire(ownerId)) return { processedCount: 0, hasMore: true };
    const assertLease = async () => {
      let held = false;
      try { held = await this.leases.renew(ownerId); }
      catch { throw new OutboxRunLeaseLostError(); }
      if (!held) throw new OutboxRunLeaseLostError();
    };
    try {
      const result = await this.processor.processBatch(batchSize, assertLease);
      await assertLease();
      // Only delivery-owned events count here; privacy tasks have their own future consumer.
      // Future retries and recent PROCESSING records still need a later invocation.
      const remaining = await this.prisma.outboxEvent.findFirst({
        where: { type: { not: ACCOUNT_DELETION_REQUESTED }, status: { in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING] } }, select: { id: true },
      });
      return { processedCount: result.processed, hasMore: remaining !== null };
    } finally { await this.leases.release(ownerId); }
  }
}
