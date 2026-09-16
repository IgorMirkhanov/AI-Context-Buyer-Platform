import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserThrottlerGuard } from './auth/user-throttler.guard';
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
      // process.env (incl. stress MOCK flags) wins over .env file values
      ignoreEnvFile: false,
      expandVariables: false,
      envFilePath: [
        join(__dirname, '../../../../.env'),
        join(__dirname, '../../.env'),
        join(process.cwd(), '.env'),
        '.env',
      ],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
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
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
  ],
})
export class AppModule {}
