import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { StorageModule } from '../storage/storage.module';
import { ProfessionalPhotoController, PublicProfessionalPhotoController } from './professional-photo.controller';
import { ProfessionalPhotoService } from './professional-photo.service';
import { PublicProfessionalsController } from './public-professionals.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [
    ProfessionalsController,
    PublicProfessionalsController,
    ProfessionalPhotoController,
    PublicProfessionalPhotoController,
  ],
  providers: [ProfessionalsService, ProfessionalPhotoService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}