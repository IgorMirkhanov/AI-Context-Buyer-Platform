import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PortfolioService } from './portfolio.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertBriefDto } from './dto/upsert-brief.dto';
import { SetFavoriteDto } from './dto/set-favorite.dto';
import { SetPrimaryPlatformDto } from './dto/set-primary-platform.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { TokenRefreshService } from '../oauth/token-refresh.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly portfolio: PortfolioService,
    private readonly tokens: TokenRefreshService,
  ) {}

  @Get()
  list(@Req() req: { user: JwtPayload }) {
    return this.projects.listForUser(req.user);
  }

  @Get('portfolio')
  portfolioList(@Req() req: { user: JwtPayload }) {
    return this.portfolio.listForUser(req.user);
  }

  @Post(':id/favorite')
  setFavorite(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetFavoriteDto,
  ) {
    return this.portfolio.setFavorite(req.user, id, dto.favorite);
  }

  @Get(':id')
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.getForOrganization(req.user.organizationId, id);
  }

  @Post()
  create(@Req() req: { user: JwtPayload }, @Body() dto: CreateProjectDto) {
    return this.projects.createForOrganization(req.user, dto);
  }

  @Put(':id/brief')
  upsertBrief(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertBriefDto,
  ) {
    return this.projects.upsertBrief(req.user.organizationId, id, dto);
  }

  /** Switch Yandex Direct ↔ Google Ads before OAuth (no credential yet). */
  @Patch(':id/platform')
  setPrimaryPlatform(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPrimaryPlatformDto,
  ) {
    return this.projects.setPrimaryPlatform(
      req.user.organizationId,
      id,
      dto.primaryPlatform,
    );
  }

  @Post(':id/oauth/yandex')
  startYandexOAuth(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.startYandexOAuth(req.user.organizationId, id);
  }

  @Post(':id/oauth/google')
  startGoogleOAuth(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.startGoogleOAuth(req.user.organizationId, id);
  }

  @Post(':id/disconnect')
  disconnect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.disconnect(req.user.organizationId, id);
  }

  @Post(':id/oauth/refresh')
  refreshOAuth(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tokens.refreshProject(req.user.organizationId, id, {
      force: true,
    });
  }
}
