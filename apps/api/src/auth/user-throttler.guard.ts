import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { JwtPayload } from './jwt-payload';

/**
 * Global rate limit tracker: authenticated requests by user id, anonymous by IP.
 *
 * APP_GUARD Throttler runs before route-level JwtAuthGuard, so `req.user` is often
 * unset. We verify the Bearer JWT with the same secret as JwtStrategy when present.
 * Login/register stay IP-keyed (no valid user token) — intentional brute-force shield.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = this.resolveUserId(req);
    if (userId) {
      return `user:${userId}`;
    }
    return super.getTracker(req);
  }

  private resolveUserId(req: Record<string, any>): string | null {
    const fromUser = req.user?.sub;
    if (typeof fromUser === 'string' && fromUser.length > 0) {
      return fromUser;
    }

    const header = req.headers?.authorization ?? req.headers?.Authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return null;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      return typeof payload?.sub === 'string' && payload.sub.length > 0
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }
}
