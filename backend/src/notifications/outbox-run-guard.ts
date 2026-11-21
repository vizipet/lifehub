export type OutboxRunGuard = () => Promise<void>;

export class OutboxRunLeaseLostError extends Error {
  constructor() {
    super('OUTBOX_RUN_LEASE_LOST');
    this.name = 'OutboxRunLeaseLostError';
  }
}
