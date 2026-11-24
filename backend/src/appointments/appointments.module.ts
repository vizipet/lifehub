import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityModule } from '../availability/availability.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { ServicesModule } from '../services/services.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentExpirationService } from './appointment-expiration.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    ClinicsModule,
    ProfessionalsModule,
    ServicesModule,
    AvailabilityModule,
    NotificationsModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentExpirationService],
})
export class AppointmentsModule {}