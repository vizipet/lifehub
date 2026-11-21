import { Injectable } from '@nestjs/common';
import { SourceAvailabilityService } from '../campaigns/source-availability.service';
import type { JobBatchResult, JobContext, JobHandler } from './job.contract';

@Injectable()
export class SourceAvailabilityJob implements JobHandler {
  readonly name = 'source-availability' as const;
  constructor(private readonly sources: SourceAvailabilityService) {}

  async execute(context: JobContext): Promise<JobBatchResult> {
    const result = await this.sources.checkBatch(context.startedAt, context.batchSize);
    return { processedCount: result.processedCount, status: result.hasMore ? 'partial' : 'completed' };
  }
}
