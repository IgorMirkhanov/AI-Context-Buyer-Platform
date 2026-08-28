import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { LlmUsageService } from './llm-usage.service';

@Controller('projects/:id/llm-usage')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class LlmUsageController {
  constructor(private readonly usage: LlmUsageService) {}

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usage.get(req.user.organizationId, id);
  }
}
