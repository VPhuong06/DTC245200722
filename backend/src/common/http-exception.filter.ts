import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './app-error';
import { logger } from './json-logger';
import { currentRequestId } from './request-context';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/** Mọi lỗi trả về cùng một định dạng: { error: { code, message, request_id, details? } }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = currentRequestId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = DEFAULT_CODES[status] ?? 'HTTP_ERROR';
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message: unknown }).message;
        if (Array.isArray(m)) {
          code = 'VALIDATION_ERROR';
          message = 'Dữ liệu chưa hợp lệ';
          details = { fields: m };
        } else {
          message = String(m);
        }
      } else {
        message = exception.message;
      }
    }

    if (status >= 500) {
      const err = exception as Error;
      logger.error('unhandled_error', { error: err?.message, stack: err?.stack });
    }

    res.status(status).json({ error: { code, message, request_id: requestId, details } });
  }
}
