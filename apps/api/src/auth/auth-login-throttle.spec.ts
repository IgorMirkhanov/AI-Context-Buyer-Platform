import {
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

@Controller('auth')
class AuthProbeController {
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login() {
    return { ok: true };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register() {
    return { ok: true };
  }
}

@Controller()
class OpenProbeController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Post('attribution/inbound/:projectId')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  inbound() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [AuthProbeController, OpenProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleProbeModule {}

describe('auth + webhook rate limits (18.2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottleProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 on the 6th POST /auth/login; other routes stay available', async () => {
    const server = app.getHttpServer();
    const loginStatuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(server)
        .post('/auth/login')
        .send({ email: 'a@b.c', password: 'x' });
      loginStatuses.push(res.status);
    }
    expect(loginStatuses.slice(0, 5).every((s) => s === 200 || s === 201)).toBe(
      true,
    );
    expect(loginStatuses[5]).toBe(429);

    const health = await request(server).get('/health');
    expect(health.status).toBe(200);

    const inbound = await request(server).post(
      '/attribution/inbound/11111111-1111-1111-1111-111111111111',
    );
    expect([200, 201]).toContain(inbound.status);
  });
});
