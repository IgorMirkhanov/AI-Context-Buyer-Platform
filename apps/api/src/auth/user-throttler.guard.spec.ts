import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { UserThrottlerGuard } from './user-throttler.guard';
import { JwtPayload } from './jwt-payload';

const TEST_JWT_SECRET = 'user-throttler-test-secret-32chars!!';

@Injectable()
class ProbeJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: TEST_JWT_SECRET,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}

@Controller('probe')
class ProbeController {
  @Get('authed')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  authed() {
    return { ok: true };
  }

  @Post('anon')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  anon() {
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
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: TEST_JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [ProbeController],
  providers: [
    ProbeJwtStrategy,
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
class UserThrottleProbeModule {}

describe('UserThrottlerGuard (21.2)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UserThrottleProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function tokenFor(sub: string): string {
    return jwt.sign({
      sub,
      organizationId: 'org-1',
      email: `${sub}@example.com`,
      role: 'member',
    } satisfies JwtPayload);
  }

  it('does not share authenticated budget across users on the same IP', async () => {
    const server = app.getHttpServer();
    const tokenA = tokenFor('user-a');
    const tokenB = tokenFor('user-b');

    const statusesA: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(server)
        .get('/probe/authed')
        .set('Authorization', `Bearer ${tokenA}`);
      statusesA.push(res.status);
    }
    expect(statusesA.slice(0, 3).every((s) => s === 200)).toBe(true);
    expect(statusesA[3]).toBe(429);

    const resB = await request(server)
      .get('/probe/authed')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
  });

  it('still rate-limits anonymous requests by IP', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(server).post('/probe/anon').send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3).every((s) => s === 200 || s === 201)).toBe(
      true,
    );
    expect(statuses[3]).toBe(429);
  });
});
