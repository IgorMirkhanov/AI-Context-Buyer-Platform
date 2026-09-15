import {
  Body,
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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { SemanticService } from './semantic.service';
import { ResolveNegativeSuggestionDto } from './dto/resolve-negative-suggestion.dto';
import { EditSemanticKeywordsDto } from './dto/edit-semantic-keywords.dto';

@Controller('projects/:id/semantic')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  @Post('keywords')
  editKeywords(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditSemanticKeywordsDto,
  ) {
    return this.semantic.editKeywords(req.user.organizationId, id, body);
  }

  @Post('negative-suggestions/:suggestionId')
  resolveNegativeSuggestion(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @Body() body: ResolveNegativeSuggestionDto,
  ) {
    return this.semantic.resolveNegativeSuggestion(
      req.user.organizationId,
      id,
      suggestionId,
      body.action,
    );
  }

  @Get('export')
  async export(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string | undefined,
    @Query('commercial') commercial: string | undefined,
    @Res() res: Response,
  ) {
    const commercialOnly = commercial !== '0' && commercial !== 'false';
    if (format === 'xlsx') {
      const body = await this.semantic.exportXlsx(
        req.user.organizationId,
        id,
        { commercialOnly },
      );
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="semantic-${id}.xls"`,
      );
      res.send(body);
      return;
    }
    const csv = await this.semantic.exportCsv(req.user.organizationId, id, {
      commercialOnly,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="semantic-${id}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  }
}
