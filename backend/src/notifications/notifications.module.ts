import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { NotificationDeliveryModule } from './notification-delivery.module';
import { NotificationsController } from './notifications.controller';
import { OutboxPersistenceModule } from './outbox-persistence.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationDeliveryModule,
    OutboxPersistenceModule,
  ],
  controllers: [NotificationsController],
  exports: [OutboxPersistenceModule, NotificationDeliveryModule],
})
export class NotificationsModule {}
