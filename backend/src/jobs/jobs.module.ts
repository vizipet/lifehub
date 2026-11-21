import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentRemindersModule } from '../appointments/appointment-reminders.module';
import { AppointmentRemindersJob } from './appointment-reminders.job';
import { CampaignMaintenanceModule } from '../campaigns/campaign-maintenance.module';
import { CampaignExpirationJob } from './campaign-expiration.job';
import { SourceAvailabilityJob } from './source-availability.job';
import { OutboxJobsModule } from '../notifications/outbox-jobs.module';
import { OutboxProcessingJob } from './outbox-processing.job';
import { CronSecretGuard } from './cron-secret.guard';
import { JOB_HANDLERS } from './job.contract';
import type { JobHandler } from './job.contract';
import { JobHttpExceptionFilter } from './job-http-exception.filter';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { LocalJobScheduler } from './local-job-scheduler.service';
import { RunJobRequestPipe } from './run-job-request.pipe';

@Module({
  imports: [ConfigModule, AppointmentRemindersModule, CampaignMaintenanceModule, OutboxJobsModule],
  controllers: [JobsController],
  providers: [
    AppointmentRemindersJob,
    CampaignExpirationJob,
    SourceAvailabilityJob,
    OutboxProcessingJob,
    {
      provide: JOB_HANDLERS,
      useFactory: (
        reminders: AppointmentRemindersJob,
        campaigns: CampaignExpirationJob,
        sources: SourceAvailabilityJob,
        outbox: OutboxProcessingJob,
      ): readonly JobHandler[] => [reminders, campaigns, sources, outbox],
      inject: [AppointmentRemindersJob, CampaignExpirationJob, SourceAvailabilityJob, OutboxProcessingJob],
    },
    JobsService,
    LocalJobScheduler,
    CronSecretGuard,
    JobHttpExceptionFilter,
    RunJobRequestPipe,
  ],
  exports: [JobsService],
})
export class JobsModule {}
