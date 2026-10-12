import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { observeHttp } from '../metrics/metrics';
import { logger } from './json-logger';
import { runWithRequestId } from './request-context';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gắn request_id cho mỗi request (nhận từ header X-Request-ID do Nginx sinh ra, nếu có)
 * và ghi một dòng log JSON khi request kết thúc. Không ghi query string hay body
 * để tránh lộ dữ liệu cá nhân (số điện thoại, email) vào log.
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  // Prometheus đọc /metrics 15 giây/lần: không ghi log, không đếm vào metrics.
  if (req.path === '/metrics') return next();
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-ID', requestId);

  runWithRequestId(requestId, () => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      observeHttp(req, res.statusCode, durationMs / 1000);
      const path = req.originalUrl.split('?')[0];
      if (path.endsWith('/health') && res.statusCode < 400) return;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger.write(level, 'http_request', {
        request_id: requestId,
        method: req.method,
        path,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
        ip: req.ip,
      });
    });
    next();
  });
}
