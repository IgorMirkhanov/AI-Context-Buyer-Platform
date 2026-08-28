import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ProjectsService } from '../projects/projects.service';
import { verifyOAuthState } from '../security/oauth-state';

@Controller('oauth')
export class OauthController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  @Get('yandex/callback')
  yandexCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    return this.finishCallback(code, state, error, res);
  }

  @Get('google-ads/callback')
  googleAdsCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    return this.finishCallback(code, state, error, res);
  }

  private async finishCallback(
    code: string | undefined,
    state: string | undefined,
    error: string | undefined,
    res: Response,
  ) {
    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const fallback = `${webOrigin}/projects?oauth=error`;

    if (error || !code || !state) {
      return res.redirect(fallback);
    }

    let projectId: string | null = null;
    try {
      const payload = verifyOAuthState(state, this.stateSecret());
      projectId = payload.projectId;
      await this.projects.completeOAuth(state, code);
      return res.redirect(`${webOrigin}/projects/${projectId}?oauth=connected`);
    } catch {
      const target = projectId
        ? `${webOrigin}/projects/${projectId}?oauth=error`
        : fallback;
      return res.redirect(target);
    }
  }

  private stateSecret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ??
      this.config.get<string>('TOKEN_ENCRYPTION_KEY') ??
      'change-me-in-production'
    );
  }
}
