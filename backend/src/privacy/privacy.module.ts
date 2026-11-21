import { SecurityModule } from '../common/security/security.module';
import { Module } from '@nestjs/common';
import { OutboxPersistenceModule } from '../notifications/outbox-persistence.module';
import { AuthModule } from '../auth/auth.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [AuthModule, OutboxPersistenceModule, SecurityModule],
  providers: [PrivacyService],
  controllers: [PrivacyController],
  exports: [PrivacyService],
})
export class PrivacyModule {}
