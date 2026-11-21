import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { StorageModule } from '../storage/storage.module';
import { ClinicsController } from './clinics.controller';
import { PublicClinicsController } from './public-clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [
    AuthModule,
    ProfessionalsModule,
    StorageModule,
  ],
  controllers: [
    ClinicsController,
    PublicClinicsController,
  ],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}