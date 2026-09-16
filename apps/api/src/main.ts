import { existsSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config';
import { assertStartupSecrets } from './security/startup-secrets';
import { resolveCorsOrigin } from './security/cors-origin';
import { ProductionSafeExceptionFilter } from './security/production-safe.filter';
import { JsonLogger } from './logging/json-logger';
import { requestIdMiddleware } from './logging/request-id.middleware';

function bootstrapEnv(): void {
  const candidates = [
    join(__dirname, '../../../.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), '../../.env'),
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      // Never clobber process env (stress/e2e force MOCK flags before spawn).
      loadEnv({ path: envPath, override: false });
    }
  }
}

bootstrapEnv();
validateEnv(process.env);
// Keep legacy secret checks for non-production (length / hex|base64 key).
if ((process.env.NODE_ENV ?? '').toLowerCase() !== 'production') {
  assertStartupSecrets(process.env);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new JsonLogger(),
  });
  app.useLogger(new JsonLogger());
  const origin = resolveCorsOrigin(
    process.env.NODE_ENV,
    process.env.WEB_ORIGIN,
  );

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new ProductionSafeExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await listen(app, port);
}

async function listen(app: INestApplication, port: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await app.listen(port);
      return;
    } catch (err) {
      lastError = err;
      if (!isAddrInUse(err) || attempt === 8) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
}

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'EADDRINUSE'
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
