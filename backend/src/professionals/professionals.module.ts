import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { PublicProfessionalsController } from './public-professionals.controller';

@Module({
  imports: [AuthModule],
  controllers: [ProfessionalsController, PublicProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}