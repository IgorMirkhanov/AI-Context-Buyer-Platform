import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ProjectsService } from './projects.service';
import { PortfolioService } from './portfolio.service';
import { ProjectsController } from './projects.controller';
import { OauthController } from '../oauth/oauth.controller';
import { TokenRefreshService } from '../oauth/token-refresh.service';

@Module({
  imports: [ConnectorsModule],
  controllers: [ProjectsController, OauthController],
  providers: [ProjectsService, PortfolioService, TokenRefreshService],
})
export class ProjectsModule {}
