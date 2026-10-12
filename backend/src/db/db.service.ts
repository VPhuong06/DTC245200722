import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { config } from '../config';

// Trả kiểu date (OID 1082) dạng chuỗi 'YYYY-MM-DD' thay vì Date để tránh lệch múi giờ.
types.setTypeParser(1082, (v) => v);
// bigint/count → number
types.setTypeParser(20, (v) => Number(v));

export type Queryable = Pick<PoolClient, 'query'>;

export function createPool(): Pool {
  const c = config().db;
  return new Pool({
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: process.env.SERVICE_NAME ?? 'backend',
  });
}

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool = createPool();

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  /** Chạy hàm trong một giao dịch; lỗi → ROLLBACK, dữ liệu cũ giữ nguyên. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/** Mã lỗi PostgreSQL khi vi phạm exclusion constraint (lịch bị chồng). */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';

export function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}
