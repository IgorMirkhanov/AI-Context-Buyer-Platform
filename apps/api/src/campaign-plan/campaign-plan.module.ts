import { Module, forwardRef } from '@nestjs/common';
import { CampaignPlanController } from './campaign-plan.controller';
import { CampaignPlanService } from './campaign-plan.service';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { SemanticModule } from '../semantic/semantic.module';

@Module({
  imports: [AiProviderModule, forwardRef(() => SemanticModule)],
  controllers: [CampaignPlanController],
  providers: [CampaignPlanService],
  exports: [CampaignPlanService],
})
export class CampaignPlanModule {}
