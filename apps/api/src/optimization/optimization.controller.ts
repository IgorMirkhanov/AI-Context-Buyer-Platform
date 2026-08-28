import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { OptimizationService } from './optimization.service';

class AutopilotDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

@Controller('projects/:id/optimization')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class OptimizationController {
  constructor(private readonly optimization: OptimizationService) {}

  @Get()
  list(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.optimization.list(req.user.organizationId, id);
  }

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.optimization.run(req.user.organizationId, id);
  }

  @Post('autopilot')
  setAutopilot(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AutopilotDto,
  ) {
    return this.optimization.setAutopilot(
      req.user.organizationId,
      id,
      dto.enabled,
      dto.confirm,
    );
  }

  @Post(':recId/approve')
  approve(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recId', ParseUUIDPipe) recId: string,
  ) {
    return this.optimization.approve(req.user.organizationId, id, recId);
  }

  @Post(':recId/reject')
  reject(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recId', ParseUUIDPipe) recId: string,
  ) {
    return this.optimization.reject(req.user.organizationId, id, recId);
  }

  @Post(':recId/apply')
  apply(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recId', ParseUUIDPipe) recId: string,
  ) {
    return this.optimization.apply(
      req.user.organizationId,
      id,
      recId,
      'user',
      req.user.sub,
    );
  }
}
