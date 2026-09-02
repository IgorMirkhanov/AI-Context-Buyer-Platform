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
import { PipelineService } from './pipeline.service';

@Controller('projects/:id/pipeline')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  inspect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pipeline.inspect(req.user.organizationId, id);
  }

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pipeline.enqueueOrRun(req.user.organizationId, id);
  }

  @Post('cancel')
  cancel(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pipeline.cancel(req.user.organizationId, id);
  }
}
