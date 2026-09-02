import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { CampaignPlanModule } from './campaign-plan/campaign-plan.module';
import { AnalysisModule } from './analysis/analysis.module';
import { SemanticModule } from './semantic/semantic.module';
import { CreativesModule } from './creatives/creatives.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ReportsModule } from './reports/reports.module';
import { OptimizationModule } from './optimization/optimization.module';
import { AttributionModule } from './attribution/attribution.module';
import { MediaModule } from './media/media.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { JobsModule } from './jobs/jobs.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuditModule } from './audit/audit.module';
import { LlmUsageModule } from './llm/llm-usage.module';
import { AiProviderModule } from './ai-provider/ai-provider.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../../.env'),
        join(__dirname, '../../.env'),
        join(process.cwd(), '.env'),
        '.env',
      ],
    }),
    PrismaModule,
    JobsModule,
    TenancyModule,
    AuthModule,
    ProjectsModule,
    AnalysisModule,
    SemanticModule,
    CampaignPlanModule,
    CreativesModule,
    CampaignsModule,
    ReportsModule,
    OptimizationModule,
    AttributionModule,
    MediaModule,
    PipelineModule,
    AlertsModule,
    AuditModule,
    LlmUsageModule,
    AiProviderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
