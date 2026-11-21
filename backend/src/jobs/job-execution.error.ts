export type JobExecutionErrorCode =
  | 'INVALID_JOB'
  | 'INVALID_JOB_BATCH_SIZE'
  | 'JOB_UNAVAILABLE'
  | 'INVALID_JOB_REGISTRATION'
  | 'INVALID_JOB_RESULT';

export class JobExecutionError extends Error {
  constructor(readonly code: JobExecutionErrorCode) {
    super(code);
    this.name = 'JobExecutionError';
  }
}
