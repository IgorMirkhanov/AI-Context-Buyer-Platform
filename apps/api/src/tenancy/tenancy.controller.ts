import {
  Body,
  Controller,
  Delete,
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
import { AcceptInviteDto, InviteClientDto, UpdateBrandingDto } from './dto';
import { ProjectAccessGuard } from './project-access.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { TenancyService } from './tenancy.service';

@Controller()
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get('branding/:slug')
  publicBranding(@Param('slug') slug: string) {
    return this.tenancy.publicBranding(slug);
  }

  @Get('organization')
  @UseGuards(JwtAuthGuard)
  organization(@Req() req: { user: JwtPayload }) {
    return this.tenancy.getOrganization(req.user);
  }

  @Patch('organization/branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  updateBranding(
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.tenancy.updateBranding(req.user, dto);
  }

  @Get('projects/:id/access')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  listAccess(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tenancy.listAccess(req.user, id);
  }

  @Post('projects/:id/access')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  invite(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteClientDto,
  ) {
    return this.tenancy.inviteClient(req.user, id, dto.email, dto.role ?? 'client');
  }

  @Delete('projects/:id/access/:userId')
  @UseGuards(JwtAuthGuard, ProjectAccessGuard)
  revoke(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tenancy.revokeAccess(req.user, id, userId);
  }

  @Post('auth/invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.tenancy.acceptInvite(dto.token, dto.password);
  }
}
