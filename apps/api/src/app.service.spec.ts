import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import * as redisPing from './health/redis-ping';

describe('AppService health', () => {
  const prisma = { $queryRaw: jest.fn() };
  let service: AppService;

  beforeEach(async () => {
    jest.restoreAllMocks();
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    jest.spyOn(redisPing, 'pingRedis').mockResolvedValue(true);

    const module = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'redis://localhost:6379' },
        },
      ],
    }).compile();
    service = module.get(AppService);
  });

  it('returns ok when postgres and redis are up', async () => {
    const body = await service.getHealth();
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ postgres: 'up', redis: 'up' });
  });

  it('returns error when postgres is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const body = await service.getHealth();
    expect(body.status).toBe('error');
    expect(body.checks.postgres).toBe('down');
    expect(body.checks.redis).toBe('up');
  });

  it('returns error when redis is down', async () => {
    jest.spyOn(redisPing, 'pingRedis').mockResolvedValue(false);
    const body = await service.getHealth();
    expect(body.status).toBe('error');
    expect(body.checks).toEqual({ postgres: 'up', redis: 'down' });
  });
});
