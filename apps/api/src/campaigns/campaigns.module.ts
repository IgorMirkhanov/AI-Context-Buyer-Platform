import { Module, forwardRef } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { OptimizationModule } from '../optimization/optimization.module';
import { ReportsModule } from '../reports/reports.module';
import { CampaignsService } from './campaigns.service';
import { CampaignSyncService } from './campaign-sync.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [
    ConnectorsModule,
    forwardRef(() => OptimizationModule),
    ReportsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignSyncService],
  exports: [CampaignsService, CampaignSyncService],
})
export class CampaignsModule {}
