import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { SemanticService } from './semantic.service';

@Controller('projects/:id/semantic')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class SemanticController {
  constructor(private readonly semantic: SemanticService) {}

  @Post('run')
  run(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.semantic.run(req.user.organizationId, id);
  }

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.semantic.getResult(req.user.organizationId, id);
  }

  @Get('export')
  async export(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    if (format === 'xlsx') {
      const body = await this.semantic.exportXlsx(req.user.organizationId, id);
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="semantic-${id}.xls"`,
      );
      res.send(body);
      return;
    }
    const csv = await this.semantic.exportCsv(req.user.organizationId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="semantic-${id}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  }
}
