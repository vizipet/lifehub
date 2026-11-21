import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { DEFAULT_JOB_BATCH_SIZE, MAX_JOB_BATCH_SIZE } from './job.contract';

export interface RunJobRequest {
  batchSize: number;
}

@Injectable()
export class RunJobRequestPipe implements PipeTransform<unknown, RunJobRequest> {
  transform(value: unknown): RunJobRequest {
    // An empty POST is equivalent to the documented empty JSON object.
    if (value === undefined) {
      return { batchSize: DEFAULT_JOB_BATCH_SIZE };
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException();
    }
    if (Object.keys(value).some((key) => key !== 'batchSize')) {
      throw new BadRequestException();
    }
    const batchSize = (value as Record<string, unknown>).batchSize;
    if (batchSize === undefined) {
      return { batchSize: DEFAULT_JOB_BATCH_SIZE };
    }
    if (
      typeof batchSize !== 'number' || !Number.isSafeInteger(batchSize) ||
      batchSize < 1 || batchSize > MAX_JOB_BATCH_SIZE
    ) {
      throw new BadRequestException();
    }
    return { batchSize };
  }
}
