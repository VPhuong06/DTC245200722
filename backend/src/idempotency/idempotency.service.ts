import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { badRequest, conflict, unprocessable } from '../common/app-error';
import { DbService } from '../db/db.service';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export interface IdempotentResult<T> {
  replayed: boolean;
  status: number;
  body: T;
}

/**
 * Bảo đảm một yêu cầu tạo lịch gửi lại nhiều lần (bấm đúp, mạng chập chờn) chỉ tạo đúng một lịch.
 * Cùng key + cùng nội dung → trả lại kết quả đã lưu. Cùng key + nội dung khác → 422.
 * Yêu cầu thất bại không được lưu để client có thể thử lại với cùng key.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly db: DbService) {}

  async run<T>(scope: string, key: string | undefined, payload: unknown, fn: () => Promise<T>): Promise<IdempotentResult<T>> {
    if (!key) {
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key');
    }
    if (!KEY_PATTERN.test(key)) {
      throw badRequest('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key phải gồm 8–100 ký tự chữ, số, "-" hoặc "_"');
    }
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    const inserted = await this.db.one(
      `INSERT INTO idempotency_keys (scope, key, request_hash, state)
       VALUES ($1, $2, $3, 'processing')
       ON CONFLICT (scope, key) DO NOTHING
       RETURNING key`,
      [scope, key, hash],
    );

    if (!inserted) {
      const existing = await this.db.one<{
        request_hash: string;
        state: string;
        response_code: number;
        response_body: T;
      }>('SELECT request_hash, state, response_code, response_body FROM idempotency_keys WHERE scope = $1 AND key = $2', [
        scope,
        key,
      ]);
      if (!existing) {
        // Bản ghi vừa bị xóa do yêu cầu trước thất bại: thử lại như yêu cầu mới.
        return this.run(scope, key, payload, fn);
      }
      if (existing.request_hash !== hash) {
        throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho một yêu cầu khác');
      }
      if (existing.state !== 'done') {
        throw conflict('REQUEST_IN_PROGRESS', 'Yêu cầu đang được xử lý, vui lòng đợi trong giây lát');
      }
      return { replayed: true, status: existing.response_code, body: existing.response_body };
    }

    try {
      const body = await fn();
      await this.db.query(
        `UPDATE idempotency_keys SET state = 'done', response_code = $3, response_body = $4
          WHERE scope = $1 AND key = $2`,
        [scope, key, HttpStatus.CREATED, JSON.stringify(body)],
      );
      return { replayed: false, status: HttpStatus.CREATED, body };
    } catch (err) {
      await this.db.query('DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2', [scope, key]).catch(() => undefined);
      throw err;
    }
  }

  /** Xóa key cũ hơn 24 giờ (worker gọi định kỳ). */
  async purge(): Promise<number> {
    const rows = await this.db.query(
      "DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours' RETURNING key",
    );
    return rows.length;
  }
}
