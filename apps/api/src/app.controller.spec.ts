import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController health', () => {
  it('sets 503 when readiness fails', async () => {
    const appService = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'error',
        service: 'api',
        uptimeSec: 1,
        checks: { postgres: 'down', redis: 'up' },
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();
    const controller = module.get(AppController);
    const res = { status: jest.fn() };
    const body = await controller.health(res as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body.status).toBe('error');
    expect(body.checks.postgres).toBe('down');
  });
});
