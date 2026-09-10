import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context';
import { redactSecrets } from './redact';

type JsonLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * Structured JSON logs: timestamp, level, context, requestId, message.
 * Uses Nest ConsoleLogger shape so existing `new Logger(X)` keeps working.
 */
export class JsonLogger extends ConsoleLogger {
  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    _errorStack?: unknown,
  ): void {
    const stream =
      writeStreamType === 'stderr' ? process.stderr : process.stdout;
    for (const raw of messages) {
      const message =
        typeof raw === 'string'
          ? redactSecrets(raw)
          : redactSecrets(stringifyLogValue(raw));
      const entry = {
        timestamp: new Date().toISOString(),
        level: logLevel as JsonLogLevel,
        context: context || 'App',
        requestId: getRequestId() ?? null,
        message,
      };
      stream.write(`${JSON.stringify(entry)}\n`);
    }
  }
}

function stringifyLogValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
