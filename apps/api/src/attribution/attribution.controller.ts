import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AttributionProvider } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { AttributionService } from './attribution.service';
import { ConnectAttributionDto } from './dto/connect-attribution.dto';

@Controller()
export class AttributionController {
  constructor(private readonly attribution: AttributionService) {}

  @Get('projects/:id/attribution')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  list(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attribution.get(req.user.organizationId, id, from, to);
  }

  @Post('projects/:id/attribution/connect')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  connect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConnectAttributionDto,
  ) {
    return this.attribution.connect(req.user.organizationId, id, dto);
  }

  @Post('projects/:id/attribution/disconnect')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  disconnect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { provider: AttributionProvider },
  ) {
    return this.attribution.disconnect(
      req.user.organizationId,
      id,
      dto.provider,
    );
  }

  @Post('projects/:id/attribution/collect')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  collect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { provider: AttributionProvider },
  ) {
    return this.attribution.collect(req.user.organizationId, id, dto.provider);
  }

  /** CRM webhooks — higher ceiling than default API routes. */
  @Post('attribution/inbound/:projectId')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  inbound(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('provider') provider: string | undefined,
    @Headers('x-attribution-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    if (!provider) {
      throw new BadRequestException('provider is required');
    }
    return this.attribution.ingestInbound(projectId, provider, secret, body);
  }
}
