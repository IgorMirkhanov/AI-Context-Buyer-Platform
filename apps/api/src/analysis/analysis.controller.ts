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
import { AnalysisService } from './analysis.service';

class UpdateAnalysisSeedsDto {
  customSeedsText!: string;
}

@Controller('projects/:id/analysis')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analysis.run(req.user.organizationId, id);
  }

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analysis.getResult(req.user.organizationId, id);
  }

  @Patch('seeds')
  updateSeeds(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnalysisSeedsDto,
  ) {
    return this.analysis.updateSeeds(
      req.user.organizationId,
      id,
      dto.customSeedsText ?? '',
    );
  }
}
