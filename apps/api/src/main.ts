import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

  app.enableCors({ origin, credentials: true });
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
