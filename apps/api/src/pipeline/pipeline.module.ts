import { Module } from '@nestjs/common';
import { SemanticModule } from '../semantic/semantic.module';
import { CreativesModule } from '../creatives/creatives.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [SemanticModule, CreativesModule, CampaignsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
})
export class PipelineModule {}
