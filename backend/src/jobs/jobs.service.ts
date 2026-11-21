import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_JOB_BATCH_SIZE,
  JOB_HANDLERS,
  JOB_NAMES,
  MAX_JOB_BATCH_SIZE,
} from './job.contract';
import type { JobHandler, JobName, JobRunResult } from './job.contract';
import { JobExecutionError } from './job-execution.error';

function isJobName(name: string): name is JobName {
  return JOB_NAMES.some((knownName) => knownName === name);
}

@Injectable()
export class JobsService {
  private readonly handlers = new Map<JobName, JobHandler>();

  constructor(@Inject(JOB_HANDLERS) handlers: readonly JobHandler[]) {
    for (const handler of handlers) {
      if (!isJobName(handler.name) || this.handlers.has(handler.name)) {
        throw new JobExecutionError('INVALID_JOB_REGISTRATION');
      }
      this.handlers.set(handler.name, handler);
    }
  }

  async run(
    job: string,
    batchSize: number = DEFAULT_JOB_BATCH_SIZE,
  ): Promise<JobRunResult> {
    if (!isJobName(job)) {
      throw new JobExecutionError('INVALID_JOB');
    }
    if (
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_JOB_BATCH_SIZE
    ) {
      throw new JobExecutionError('INVALID_JOB_BATCH_SIZE');
    }

    const handler = this.handlers.get(job);
    if (!handler) {
      throw new JobExecutionError('JOB_UNAVAILABLE');
    }

    const runId = randomUUID();
    const result = await handler.execute({
      runId,
      startedAt: new Date(),
      batchSize,
    });
    if (
      !result ||
      (result.status !== 'completed' && result.status !== 'partial') ||
      !Number.isSafeInteger(result.processedCount) ||
      result.processedCount < 0 ||
      result.processedCount > batchSize
    ) {
      throw new JobExecutionError('INVALID_JOB_RESULT');
    }

    // Explicit projection avoids returning private details supplied by a handler.
    return {
      job,
      runId,
      status: result.status,
      processedCount: result.processedCount,
    };
  }
}
