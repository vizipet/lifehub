import { Injectable } from '@nestjs/common';
import { AppointmentRemindersService } from '../appointments/appointment-reminders.service';
import type { JobBatchResult, JobContext, JobHandler } from './job.contract';

@Injectable()
export class AppointmentRemindersJob implements JobHandler {
  readonly name = 'appointment-reminders' as const;
  constructor(private readonly reminders: AppointmentRemindersService) {}

  async execute(context: JobContext): Promise<JobBatchResult> {
    const result = await this.reminders.enqueueBatch(context.startedAt, context.batchSize);
    return {
      status: result.hasMore ? 'partial' : 'completed',
      processedCount: result.processedCount,
    };
  }
}
