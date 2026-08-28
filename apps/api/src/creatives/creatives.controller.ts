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
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { CreativesService } from './creatives.service';

class UpdateCreativeDto {
  @IsString()
  @MinLength(1)
  text!: string;
}

@Controller('projects/:id/creatives')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class CreativesController {
  constructor(private readonly creatives: CreativesService) {}

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creatives.run(req.user.organizationId, id);
  }

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creatives.getResult(req.user.organizationId, id);
  }

  @Patch(':creativeId')
  update(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('creativeId', ParseUUIDPipe) creativeId: string,
    @Body() dto: UpdateCreativeDto,
  ) {
    return this.creatives.updateText(
      req.user.organizationId,
      id,
      creativeId,
      dto.text,
    );
  }
}
