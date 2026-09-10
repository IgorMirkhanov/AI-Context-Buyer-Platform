import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

type SafeBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
};

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

function looksLikeInternalDetail(message: string): boolean {
  return /prisma|postgres|econnrefused|sql|stack|at\s+\S+\s+\(/i.test(message);
}

/**
 * In production, never leak stacks or DB internals to clients.
 * Dev/test keep Nest HttpException payloads (and richer 500 messages).
 */
@Catch()
export class ProductionSafeExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger(ProductionSafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const prod = isProduction();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (!prod) {
        response.status(status).json(payload);
        return;
      }
      const body = this.sanitizeHttpException(status, payload);
      response.status(status).json(body);
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.log.error(err.message, err.stack);

    if (prod) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      } satisfies SafeBody);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: err.message,
      stack: err.stack,
    });
  }

  private sanitizeHttpException(
    status: number,
    payload: string | object,
  ): SafeBody {
    if (typeof payload === 'string') {
      if (status >= 500 || looksLikeInternalDetail(payload)) {
        return {
          statusCode: status,
          message:
            status >= 500 ? 'Internal server error' : 'Request failed',
        };
      }
      return { statusCode: status, message: payload };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record.message;
    let message: string | string[] =
      typeof rawMessage === 'string' || Array.isArray(rawMessage)
        ? (rawMessage as string | string[])
        : 'Request failed';

    if (status >= 500) {
      message = 'Internal server error';
    } else if (typeof message === 'string' && looksLikeInternalDetail(message)) {
      message = 'Request failed';
    } else if (Array.isArray(message)) {
      message = message.map((item) =>
        looksLikeInternalDetail(String(item)) ? 'Request failed' : String(item),
      );
    }

    const body: SafeBody = { statusCode: status, message };
    if (typeof record.error === 'string' && status < 500) {
      body.error = record.error;
    }
    return body;
  }
}
