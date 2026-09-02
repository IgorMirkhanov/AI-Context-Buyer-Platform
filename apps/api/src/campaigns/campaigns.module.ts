import { Module, forwardRef } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { OptimizationModule } from '../optimization/optimization.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [ConnectorsModule, forwardRef(() => OptimizationModule)],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
