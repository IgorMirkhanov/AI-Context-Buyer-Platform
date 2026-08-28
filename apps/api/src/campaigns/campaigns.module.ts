import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [ConnectorsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
