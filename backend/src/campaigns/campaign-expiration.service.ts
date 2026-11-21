import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CampaignStatus, Prisma } from '../generated/prisma/client';

@Injectable()
export class CampaignExpirationService {
  constructor(private readonly prisma: PrismaService) {}

  async endExpiredBatch(now: Date, batchSize: number) {
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
      throw new Error('INVALID_CAMPAIGN_EXPIRATION_BATCH');
    }
    // Same business predicate as G1 endExpiredCampaigns: PUBLISHED and endsAt < now.
    // Bound the batch and lock candidates before changing state.
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT c.id FROM public.campaigns c
        WHERE c.status = 'PUBLISHED' AND c.ends_at < ${now}
        ORDER BY c.ends_at ASC, c.id ASC
        LIMIT ${batchSize} FOR UPDATE OF c SKIP LOCKED
      `);
      let processedCount = 0;
      if (rows.length > 0) {
        const updated = await tx.campaign.updateMany({
          where: {
            id: { in: rows.map((row) => row.id) },
            status: CampaignStatus.PUBLISHED,
            endsAt: { lt: now },
          },
          data: { status: CampaignStatus.ENDED },
        });
        processedCount = updated.count;
      }
      const remaining = await tx.campaign.findFirst({
        where: { status: CampaignStatus.PUBLISHED, endsAt: { lt: now } },
        select: { id: true },
      });
      return { processedCount, hasMore: remaining !== null };
    }, { timeout: 10_000 });
  }
}
