export const OUTBOX_CONTRACT = Symbol('OUTBOX_CONTRACT');

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface TransactionClient {
  [key: string]: unknown;
}

export interface OutboxContract {
  emitOutbox(
    event: DomainEvent,
    tx: TransactionClient,
  ): Promise<void>;
}