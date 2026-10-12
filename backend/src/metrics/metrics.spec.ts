import type { Request } from 'express';
import { initBookingSeries, observeHttp, registry } from './metrics';

function fakeReq(method: string, baseUrl: string, routePath?: string): Request {
  return { method, baseUrl, route: routePath ? { path: routePath } : undefined } as unknown as Request;
}

/** Giá trị của một chuỗi metrics khớp đúng các nhãn cho trước (bỏ qua thứ tự nhãn). */
async function valueOf(name: string, labels: Record<string, string>, series = name): Promise<number | undefined> {
  const metric = registry.getSingleMetric(name);
  if (!metric) return undefined;
  const { values } = await metric.get();
  const hit = values.find(
    (v) => ((v as { metricName?: string }).metricName ?? name) === series &&
      Object.entries(labels).every(([k, val]) => String((v.labels as Record<string, unknown>)[k]) === val),
  );
  return hit?.value;
}

describe('metrics HTTP', () => {
  beforeEach(() => registry.resetMetrics());

  it('gắn nhãn route theo mẫu đường dẫn, không theo mã lịch thật', async () => {
    observeHttp(fakeReq('POST', '', '/api/v1/admin/appointments/:id/confirm'), 200, 0.012);
    const text = await registry.metrics();
    expect(text).toContain('route="/api/v1/admin/appointments/:id/confirm"');
    expect(text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('request không khớp route nào được gom vào nhãn unmatched', async () => {
    observeHttp(fakeReq('GET', ''), 404, 0.001);
    expect(await valueOf('http_requests_total', { method: 'GET', route: 'unmatched', status: '404' })).toBe(1);
  });

  it('chuỗi thống kê đặt lịch có sẵn ở 0 trước request đầu tiên', async () => {
    initBookingSeries();
    for (const route of ['/api/v1/appointments', '/api/v1/admin/appointments']) {
      expect(await valueOf('http_requests_total', { method: 'POST', route, status: '201' })).toBe(0);
      expect(await valueOf('http_requests_total', { method: 'POST', route, status: '409' })).toBe(0);
    }
  });

  it('đếm request theo mã trạng thái và ghi thời gian vào histogram', async () => {
    const req = fakeReq('POST', '', '/api/v1/appointments');
    observeHttp(req, 201, 0.03);
    observeHttp(req, 201, 0.04);
    observeHttp(req, 409, 0.02);
    const base = { method: 'POST', route: '/api/v1/appointments' };
    expect(await valueOf('http_requests_total', { ...base, status: '201' })).toBe(2);
    expect(await valueOf('http_requests_total', { ...base, status: '409' })).toBe(1);
    expect(await valueOf('http_request_duration_seconds', { ...base, status: '201', le: '0.05' }, 'http_request_duration_seconds_bucket')).toBe(2);
    expect(await valueOf('http_request_duration_seconds', { ...base, status: '201', le: '0.025' }, 'http_request_duration_seconds_bucket')).toBe(0);
  });
});
