import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { pingRedis } from './health/redis-ping';

export type HealthCheck = {
  status: 'ok' | 'error';
  service: 'api';
  uptimeSec: number;
  checks: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
};

@Injectable()
export class AppService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Readiness: process + Postgres + Redis ping. */
  async getHealth(): Promise<HealthCheck> {
    const [postgresUp, redisUp] = await Promise.all([
      this.pingPostgres(),
      pingRedis(this.config.get<string>('REDIS_URL')),
    ]);

    const ok = postgresUp && redisUp;
    return {
      status: ok ? 'ok' : 'error',
      service: 'api',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        postgres: postgresUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    };
  }

  private async pingPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
