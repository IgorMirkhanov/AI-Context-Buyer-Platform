import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { AuditService } from './audit.service';

@Controller('projects/:id/audit')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.audit.list(req.user.organizationId, id);
  }
}
