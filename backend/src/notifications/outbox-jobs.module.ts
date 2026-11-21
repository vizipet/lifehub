import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { NotificationDeliveryModule } from './notification-delivery.module';
import { OutboxJobService } from './outbox-job.service';
import { OutboxRunLeaseService } from './outbox-run-lease.service';

@Module({
  imports: [PrismaModule, NotificationDeliveryModule],
  providers: [OutboxJobService, OutboxRunLeaseService],
  exports: [OutboxJobService, OutboxRunLeaseService],
})
export class OutboxJobsModule {}
