import { Injectable } from '@nestjs/common';
import { OutboxJobService } from '../notifications/outbox-job.service';
import type { JobBatchResult, JobContext, JobHandler } from './job.contract';

@Injectable()
export class OutboxProcessingJob implements JobHandler {
  readonly name = 'outbox-processing' as const;
  constructor(private readonly outbox: OutboxJobService) {}

  async execute(context: JobContext): Promise<JobBatchResult> {
    const result = await this.outbox.runBatch(context.batchSize);
    return { processedCount: result.processedCount, status: result.hasMore ? 'partial' : 'completed' };
  }
}
