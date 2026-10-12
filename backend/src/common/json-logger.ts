import { LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context';

type Level = 'debug' | 'info' | 'warn' | 'error';

const NOISY_CONTEXTS = new Set(['RoutesResolver', 'RouterExplorer', 'InstanceLoader']);

/**
 * Ghi log dạng JSON một dòng ra stdout để Promtail/Loki thu thập.
 * Mỗi dòng có service, level, msg và request_id (nếu đang trong một request).
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly service = process.env.SERVICE_NAME ?? 'backend') {}

  write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
    const line = {
      time: new Date().toISOString(),
      level,
      service: this.service,
      msg,
      request_id: currentRequestId(),
      ...fields,
    };
    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(JSON.stringify(line) + '\n');
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.write('info', msg, fields);
  }

  // Các hàm dưới đây theo giao diện LoggerService của NestJS.
  log(message: unknown, context?: string): void {
    // Log khởi động chi tiết của NestJS (map route, nạp module) chỉ hiện ở mức debug.
    if (context && NOISY_CONTEXTS.has(context)) return this.debug(message, context);
    this.write('info', String(message), context ? { context } : {});
  }

  warn(message: unknown, context?: string | Record<string, unknown>): void {
    this.write('warn', String(message), typeof context === 'string' ? { context } : (context ?? {}));
  }

  error(message: unknown, trace?: string | Record<string, unknown>, context?: string): void {
    const fields: Record<string, unknown> = typeof trace === 'object' ? trace : { stack: trace };
    if (context) fields.context = context;
    this.write('error', String(message), fields);
  }

  debug(message: unknown, context?: string): void {
    if (process.env.LOG_LEVEL === 'debug') this.write('debug', String(message), context ? { context } : {});
  }

  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }
}

export const logger = new JsonLogger();
