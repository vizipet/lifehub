import { Injectable } from '@nestjs/common';
import { CampaignExpirationService } from '../campaigns/campaign-expiration.service';
import type { JobBatchResult, JobContext, JobHandler } from './job.contract';

@Injectable()
export class CampaignExpirationJob implements JobHandler {
  readonly name = 'campaign-expiration' as const;
  constructor(private readonly campaigns: CampaignExpirationService) {}

  async execute(context: JobContext): Promise<JobBatchResult> {
    const result = await this.campaigns.endExpiredBatch(context.startedAt, context.batchSize);
    return {
      status: result.hasMore ? 'partial' : 'completed',
      processedCount: result.processedCount,
    };
  }
}
