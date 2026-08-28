import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { CampaignsService } from './campaigns.service';
import { UpdateCampaignDraftDto } from './dto/update-draft.dto';

@Controller('projects/:id/campaigns')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post('draft')
  build(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaigns.build(req.user.organizationId, id);
  }

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaigns.getResult(req.user.organizationId, id);
  }

  @Patch('draft')
  update(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCampaignDraftDto,
  ) {
    return this.campaigns.updateDraft(
      req.user.organizationId,
      id,
      body.structure,
    );
  }

  @Post('publish')
  publish(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaigns.publish(req.user.organizationId, id, req.user.sub);
  }
}
