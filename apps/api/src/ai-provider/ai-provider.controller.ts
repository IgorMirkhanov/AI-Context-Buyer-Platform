import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { Roles } from '../tenancy/roles.decorator';
import { RolesGuard } from '../tenancy/roles.guard';
import { AiProviderService } from './ai-provider.service';
import {
  UpdateLlmSpendCapDto,
  UpsertAiProviderDto,
  VerifyAiProviderDto,
} from './dto';

@Controller('organization/ai-provider')
@UseGuards(JwtAuthGuard)
export class AiProviderController {
  constructor(private readonly ai: AiProviderService) {}

  @Get()
  status(@Req() req: { user: JwtPayload }) {
    return this.ai.getStatus(req.user.organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner')
  upsert(
    @Req() req: { user: JwtPayload },
    @Body() dto: UpsertAiProviderDto,
  ) {
    return this.ai.upsert(req.user.organizationId, dto.provider, dto.apiKey);
  }

  @Post('verify')
  @UseGuards(RolesGuard)
  @Roles('owner')
  verify(
    @Req() req: { user: JwtPayload },
    @Body() dto: VerifyAiProviderDto,
  ) {
    return this.ai.verify(
      req.user.organizationId,
      dto.provider,
      dto.apiKey,
    );
  }

  @Post('spend-cap')
  @UseGuards(RolesGuard)
  @Roles('owner')
  updateSpendCap(
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateLlmSpendCapDto,
  ) {
    return this.ai.updateLlmMonthlyCap(
      req.user.organizationId,
      dto.llmMonthlyCapUsd,
    );
  }
}
