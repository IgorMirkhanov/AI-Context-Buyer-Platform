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
import { CampaignPlanService } from './campaign-plan.service';

@Controller('projects/:id/campaign-plan')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class CampaignPlanController {
  constructor(private readonly campaignPlan: CampaignPlanService) {}

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignPlan.run(req.user.organizationId, id);
  }

  @Post('approve')
  approve(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignPlan.approve(req.user.organizationId, id);
  }

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignPlan.getResult(req.user.organizationId, id);
  }
}
