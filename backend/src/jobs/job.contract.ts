export const JOB_NAMES = [
  'appointment-reminders',
  'campaign-expiration',
  'source-availability',
  'outbox-processing',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

// Internal provider token; no handler is enabled until its subdivision is ready.
export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
export const DEFAULT_JOB_BATCH_SIZE = 10;
export const MAX_JOB_BATCH_SIZE = 25;

export interface JobContext {
  readonly runId: string;
  readonly startedAt: Date;
  readonly batchSize: number;
}

export interface JobBatchResult {
  // Describes this invocation; it does not certify the whole G6 or delivery.
  readonly status: 'completed' | 'partial';
  // Number of handled items in this batch, between zero and context.batchSize.
  readonly processedCount: number;
}

export interface JobHandler {
  readonly name: JobName;
  execute(context: JobContext): Promise<JobBatchResult>;
}

export interface JobRunResult extends JobBatchResult {
  readonly job: JobName;
  readonly runId: string;
}
