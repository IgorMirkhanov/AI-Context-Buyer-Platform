import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { ProjectAccessGuard } from '../tenancy/project-access.guard';
import { ReportsService } from './reports.service';

@Controller('projects/:id/reports')
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.getReport(req.user.organizationId, id, from, to);
  }

  @Post('collect')
  collect(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.collectForOrganization(req.user.organizationId, id);
  }
}
