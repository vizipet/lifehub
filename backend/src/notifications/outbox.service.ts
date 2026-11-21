import { Injectable } from '@nestjs/common';
import type {
  DomainEvent,
  OutboxContract,
  TransactionClient,
} from '../auth/contracts/outbox.contract';

interface OutboxTransactionClient extends TransactionClient {
  outboxEvent: {
    create(args: {
      data: {
        type: string;
        payload: Record<string, unknown>;
      };
    }): Promise<unknown>;
  };
}

@Injectable()
export class OutboxService implements OutboxContract {
  async emitOutbox(
    event: DomainEvent,
    tx: TransactionClient,
  ): Promise<void> {
    const transaction = tx as OutboxTransactionClient;

    await transaction.outboxEvent.create({
      data: {
        type: event.type,
        payload: event.payload,
      },
    });
  }
}