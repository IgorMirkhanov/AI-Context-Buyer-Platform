import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { MediaService } from './media.service';

class GenerateMediaDto {
  @IsOptional()
  @IsArray()
  @IsIn(['image', 'video'], { each: true })
  kinds?: Array<'image' | 'video'>;
}

@Controller('projects/:id/media')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.media.list(req.user.organizationId, id);
  }

  @Post('generate')
  generate(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateMediaDto,
  ) {
    return this.media.generate(
      req.user.organizationId,
      id,
      dto.kinds && dto.kinds.length > 0 ? dto.kinds : ['image'],
    );
  }

  @Get(':assetId/file')
  async file(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res() res: Response,
  ) {
    const file = await this.media.getFile(req.user.organizationId, id, assetId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(file.body);
  }

  @Post(':assetId/approve')
  approve(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.media.approve(req.user.organizationId, id, assetId);
  }

  @Post(':assetId/reject')
  reject(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.media.reject(req.user.organizationId, id, assetId);
  }
}
