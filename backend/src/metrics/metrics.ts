import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { vnStartOfDay, vnToday, addDays } from '../common/time';
import type { DbService } from '../db/db.service';

/**
 * Metrics của backend cho Prometheus, phục vụ tại GET /metrics (cổng 3000).
 * Nginx chỉ chuyển tiếp /api/ nên /metrics không ra được Internet;
 * chỉ Prometheus trong mạng nội bộ Docker đọc được.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: process.env.SERVICE_NAME ?? 'backend' });
collectDefaultMetrics({ register: registry });

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Số request HTTP backend đã xử lý',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

/**
 * Tạo sẵn ở giá trị 0 các chuỗi dùng cho thống kê đặt lịch (tạo thành công 201, trùng giờ 409).
 * Nếu chuỗi chỉ xuất hiện khi có request đầu tiên, mẫu đầu tiên Prometheus thấy đã khác 0
 * và increase() bỏ sót các lịch tạo trước lần thu thập đó (ví dụ ngay sau khi backend khởi động).
 */
export function initBookingSeries(): void {
  for (const route of ['/api/v1/appointments', '/api/v1/admin/appointments']) {
    for (const status of ['201', '409']) httpRequests.inc({ method: 'POST', route, status }, 0);
  }
}
initBookingSeries();

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý request HTTP của backend',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Nhãn route lấy theo mẫu đường dẫn (ví dụ /api/v1/admin/appointments/:id/confirm)
 * chứ không theo đường dẫn thật, để mã lịch hay UUID không làm bùng nổ số chuỗi metrics.
 */
function routeLabel(req: Request): string {
  const route = (req as Request & { route?: { path?: string } }).route?.path;
  return route ? `${req.baseUrl}${route}` : 'unmatched';
}

/** Ghi metrics cho một request đã kết thúc. Gọi từ middleware ghi log request. */
export function observeHttp(req: Request, status: number, durationSeconds: number): void {
  const labels = { method: req.method, route: routeLabel(req), status: String(status) };
  httpRequests.inc(labels);
  httpDuration.observe(labels, durationSeconds);
}

/**
 * Số lịch hẹn trong ngày hôm nay (giờ Việt Nam) theo trạng thái.
 * Đọc từ cơ sở dữ liệu mỗi lần Prometheus thu thập (15 giây/lần).
 */
export function registerBusinessMetrics(db: DbService): void {
  new Gauge({
    name: 'booking_appointments_today',
    help: 'Số lịch hẹn trong ngày hôm nay theo trạng thái',
    labelNames: ['status'] as const,
    registers: [registry],
    async collect() {
      const today = vnToday();
      const rows = await db.query<{ status: string; count: number }>(
        `SELECT status, count(*) AS count FROM appointments
          WHERE start_at >= $1 AND start_at < $2 GROUP BY status`,
        [vnStartOfDay(today), vnStartOfDay(addDays(today, 1))],
      );
      this.reset();
      for (const r of rows) this.set({ status: r.status }, r.count);
    },
  });

  // Đếm từ cơ sở dữ liệu thay vì increase() trên counter HTTP: increase() ngoại suy theo
  // khung thời gian nên không cho số nguyên chính xác, và counter về 0 khi backend khởi động lại.
  new Gauge({
    name: 'booking_appointments_created_24h',
    help: 'Số lịch hẹn được tạo trong 24 giờ qua theo nguồn',
    labelNames: ['source'] as const,
    registers: [registry],
    async collect() {
      const rows = await db.query<{ source: string; count: number }>(
        `SELECT source, count(*) AS count FROM appointments
          WHERE created_at >= now() - interval '24 hours' GROUP BY source`,
      );
      this.reset();
      for (const r of rows) this.set({ source: r.source }, r.count);
    },
  });
}

export async function metricsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    next(err);
  }
}
