import { Module } from '@nestjs/common';
import { CampaignPlanModule } from '../campaign-plan/campaign-plan.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { SemanticModule } from '../semantic/semantic.module';
import { CreativesModule } from '../creatives/creatives.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [AnalysisModule, SemanticModule, CampaignPlanModule, CreativesModule, CampaignsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
})
export class PipelineModule {}
