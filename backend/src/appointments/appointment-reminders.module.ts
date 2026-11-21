import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AppointmentReminderOutboxModule } from '../notifications/appointment-reminder-outbox.module';
import { AppointmentRemindersService } from './appointment-reminders.service';

@Module({
  imports: [PrismaModule, AppointmentReminderOutboxModule],
  providers: [AppointmentRemindersService],
  exports: [AppointmentRemindersService],
})
export class AppointmentRemindersModule {}
