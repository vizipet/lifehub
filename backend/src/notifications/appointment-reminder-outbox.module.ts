import { Module } from '@nestjs/common';
import { AppointmentReminderOutboxService } from './appointment-reminder-outbox.service';

@Module({
  providers: [AppointmentReminderOutboxService],
  exports: [AppointmentReminderOutboxService],
})
export class AppointmentReminderOutboxModule {}
