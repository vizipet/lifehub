import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CampaignExpirationService } from './campaign-expiration.service';
import { SourceAvailabilityService } from './source-availability.service';
import { SourceProbeService } from './source-probe.service';
import { SourceNetworkService, sourceNetworkProviders } from './source-network.service';

@Module({
  imports: [PrismaModule],
  providers: [CampaignExpirationService, SourceAvailabilityService, SourceProbeService, SourceNetworkService, ...sourceNetworkProviders],
  exports: [CampaignExpirationService, SourceAvailabilityService],
})
export class CampaignMaintenanceModule {}
