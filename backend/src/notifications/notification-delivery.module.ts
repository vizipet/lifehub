import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PasswordResetEnvelope } from '../common/security/password-reset-envelope';
import { PasswordResetEmailService } from './password-reset-email.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { LocalMailboxEmailSender } from './local-mailbox-email.sender';
import { NOTIFICATION_EMAIL_SENDER } from './notification-email.contract';
import { NotificationEmailService } from './notification-email.service';
import { NotificationsService } from './notifications.service';
import { OutboxProcessorService } from './outbox-processor.service';

// Delivery has no dependency on user login routes/guards. Both modules reuse these providers.
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    PasswordResetEnvelope,
    PasswordResetEmailService,
    OutboxProcessorService,
    NotificationsService,
    NotificationEmailService,
    // Versão acadêmica: os e-mails ficam numa pasta local (backend/mailbox).
    {
      provide: NOTIFICATION_EMAIL_SENDER,
      useClass: LocalMailboxEmailSender,
    },
  ],
  exports: [
    OutboxProcessorService,
    NotificationsService,
    NotificationEmailService,
    NOTIFICATION_EMAIL_SENDER,
  ],
})
export class NotificationDeliveryModule {}
