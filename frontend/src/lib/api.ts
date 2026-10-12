export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

let onUnauthorized: (() => void) | null = null;

/** Trang quản trị đăng ký hàm này để chuyển về màn hình đăng nhập khi phiên hết hạn. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* phản hồi không phải JSON (ví dụ trang lỗi của Nginx) */
  }

  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; request_id?: string; details?: Record<string, unknown> } })?.error;
    const error = new ApiError(
      res.status,
      e?.code ?? `HTTP_${res.status}`,
      e?.message ?? fallbackMessage(res.status),
      e?.request_id ?? res.headers.get('x-request-id') ?? undefined,
      e?.details,
    );
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized();
    throw error;
  }
  return data as T;
}

function fallbackMessage(status: number): string {
  if (status === 429) return 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.';
  if (status >= 500) return 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.';
  return 'Yêu cầu không thành công.';
}

/** Khóa idempotency cho một lần gửi; giữ nguyên khi thử lại cùng nội dung. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}
