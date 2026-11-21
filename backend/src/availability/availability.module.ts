import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { ServicesModule } from '../services/services.module';
import { AvailabilityController } from './availability.controller';
import { PublicAvailabilityController } from './public-availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [AuthModule, ClinicsModule, ServicesModule],
  controllers: [AvailabilityController, PublicAvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
