import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { AlertsService } from './alerts.service';

@Controller('projects/:id/alerts')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alerts.list(req.user.organizationId, id);
  }

  @Post(':alertId/ack')
  acknowledge(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.alerts.acknowledge(req.user.organizationId, id, alertId);
  }
}
