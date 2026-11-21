import { Module } from '@nestjs/common';
import { OUTBOX_CONTRACT } from '../auth/contracts/outbox.contract';
import { OutboxService } from './outbox.service';

// Producers can persist events without importing login routes or delivery providers.
@Module({
  providers: [
    OutboxService,
    { provide: OUTBOX_CONTRACT, useExisting: OutboxService },
  ],
  exports: [OUTBOX_CONTRACT, OutboxService],
})
export class OutboxPersistenceModule {}
