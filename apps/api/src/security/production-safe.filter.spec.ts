import {
  Controller,
  Get,
  INestApplication,
  InternalServerErrorException,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductionSafeExceptionFilter } from './production-safe.filter';

@Controller('probe')
class ProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('prisma P1001: Can\'t reach database server at localhost');
  }

  @Get('http-500')
  http500(): never {
    throw new InternalServerErrorException(
      'prisma query failed: SELECT * FROM users',
    );
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('ProductionSafeExceptionFilter', () => {
  let app: INestApplication;
  const prev = process.env.NODE_ENV;

  afterEach(async () => {
    process.env.NODE_ENV = prev;
    if (app) await app.close();
  });

  async function boot(nodeEnv: string) {
    process.env.NODE_ENV = nodeEnv;
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProductionSafeExceptionFilter());
    await app.init();
  }

  it('hides stack and DB detail in production', async () => {
    await boot('production');
    const res = await request(app.getHttpServer()).get('/probe/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|localhost/i);
  });

  it('sanitizes HttpException 500 bodies in production', async () => {
    await boot('production');
    const res = await request(app.getHttpServer()).get('/probe/http-500');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|SELECT/i);
  });

  it('keeps error detail in development', async () => {
    await boot('development');
    const res = await request(app.getHttpServer()).get('/probe/boom');
    expect(res.status).toBe(500);
    expect(String(res.body.message)).toMatch(/prisma/i);
    expect(res.body.stack).toBeDefined();
  });
});
