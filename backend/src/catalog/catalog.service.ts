import { Injectable } from '@nestjs/common';
import { badRequest, notFound } from '../common/app-error';
import type { PoolClient } from 'pg';
import { DbService } from '../db/db.service';

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceVnd: number;
  active: boolean;
}

export interface WorkingHour {
  weekday: number;
  start: string;
  end: string;
}

export interface Staff {
  id: string;
  fullName: string;
  title: string;
  active: boolean;
  serviceIds: string[];
  workingHours: WorkingHour[];
}

interface ServiceRow {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  buffer_min: number;
  price_vnd: number;
  active: boolean;
}

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  name: r.name,
  description: r.description,
  durationMin: r.duration_min,
  bufferMin: r.buffer_min,
  priceVnd: r.price_vnd,
  active: r.active,
});

export interface ServiceInput {
  name: string;
  description?: string;
  durationMin: number;
  bufferMin: number;
  priceVnd: number;
  active: boolean;
}

export interface StaffInput {
  fullName: string;
  title?: string;
  active: boolean;
  serviceIds: string[];
  workingHours: WorkingHour[];
}

@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService) {}

  // ---------- Dịch vụ ----------

  async listServices(activeOnly: boolean): Promise<Service[]> {
    const rows = await this.db.query<ServiceRow>(
      `SELECT * FROM services ${activeOnly ? 'WHERE active' : ''} ORDER BY name`,
    );
    return rows.map(toService);
  }

  async getService(id: string): Promise<Service> {
    const row = await this.db.one<ServiceRow>('SELECT * FROM services WHERE id = $1', [id]);
    if (!row) throw notFound('Không tìm thấy dịch vụ');
    return toService(row);
  }

  async createService(input: ServiceInput): Promise<Service> {
    const row = await this.db.one<ServiceRow>(
      `INSERT INTO services (name, description, duration_min, buffer_min, price_vnd, active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [input.name.trim(), input.description?.trim() ?? '', input.durationMin, input.bufferMin, input.priceVnd, input.active],
    );
    return toService(row!);
  }

  async updateService(id: string, input: ServiceInput): Promise<Service> {
    const row = await this.db.one<ServiceRow>(
      `UPDATE services SET name = $2, description = $3, duration_min = $4, buffer_min = $5, price_vnd = $6, active = $7
        WHERE id = $1 RETURNING *`,
      [id, input.name.trim(), input.description?.trim() ?? '', input.durationMin, input.bufferMin, input.priceVnd, input.active],
    );
    if (!row) throw notFound('Không tìm thấy dịch vụ');
    return toService(row);
  }

  // ---------- Nhân viên ----------

  async listStaff(opts: { activeOnly: boolean; serviceId?: string }): Promise<Staff[]> {
    const rows = await this.db.query<{
      id: string;
      full_name: string;
      title: string;
      active: boolean;
      service_ids: string[];
      working_hours: { weekday: number; start: string; end: string }[];
    }>(
      `SELECT st.id, st.full_name, st.title, st.active,
              COALESCE((SELECT array_agg(ss.service_id ORDER BY ss.service_id)
                          FROM staff_services ss WHERE ss.staff_id = st.id), '{}') AS service_ids,
              COALESCE((SELECT json_agg(json_build_object(
                                 'weekday', wh.weekday,
                                 'start', to_char(wh.start_time, 'HH24:MI'),
                                 'end', to_char(wh.end_time, 'HH24:MI'))
                               ORDER BY wh.weekday, wh.start_time)
                          FROM working_hours wh WHERE wh.staff_id = st.id), '[]') AS working_hours
         FROM staff st
        WHERE ($1::boolean IS FALSE OR st.active)
          AND ($2::uuid IS NULL OR EXISTS (
                SELECT 1 FROM staff_services ss WHERE ss.staff_id = st.id AND ss.service_id = $2))
        ORDER BY st.full_name`,
      [opts.activeOnly, opts.serviceId ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      title: r.title,
      active: r.active,
      serviceIds: r.service_ids,
      workingHours: r.working_hours,
    }));
  }

  async createStaff(input: StaffInput): Promise<Staff> {
    this.validateHours(input.workingHours);
    const id = await this.db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO staff (full_name, title, active) VALUES ($1, $2, $3) RETURNING id',
        [input.fullName.trim(), input.title?.trim() ?? '', input.active],
      );
      await this.replaceStaffLinks(c, rows[0].id, input);
      return rows[0].id;
    });
    return this.getStaff(id);
  }

  async updateStaff(id: string, input: StaffInput): Promise<Staff> {
    this.validateHours(input.workingHours);
    await this.db.tx(async (c) => {
      const { rowCount } = await c.query('UPDATE staff SET full_name = $2, title = $3, active = $4 WHERE id = $1', [
        id,
        input.fullName.trim(),
        input.title?.trim() ?? '',
        input.active,
      ]);
      if (!rowCount) throw notFound('Không tìm thấy nhân viên');
      await this.replaceStaffLinks(c, id, input);
    });
    return this.getStaff(id);
  }

  async getStaff(id: string): Promise<Staff> {
    const all = await this.listStaff({ activeOnly: false });
    const found = all.find((s) => s.id === id);
    if (!found) throw notFound('Không tìm thấy nhân viên');
    return found;
  }

  private validateHours(hours: WorkingHour[]): void {
    for (const h of hours) {
      if (h.start >= h.end) {
        throw badRequest('INVALID_WORKING_HOURS', 'Giờ bắt đầu ca phải trước giờ kết thúc');
      }
    }
  }

  private async replaceStaffLinks(
    c: PoolClient,
    staffId: string,
    input: StaffInput,
  ): Promise<void> {
    await c.query('DELETE FROM staff_services WHERE staff_id = $1', [staffId]);
    if (input.serviceIds.length) {
      await c.query(
        'INSERT INTO staff_services (staff_id, service_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING',
        [staffId, input.serviceIds],
      );
    }
    await c.query('DELETE FROM working_hours WHERE staff_id = $1', [staffId]);
    for (const h of input.workingHours) {
      await c.query('INSERT INTO working_hours (staff_id, weekday, start_time, end_time) VALUES ($1, $2, $3, $4)', [
        staffId,
        h.weekday,
        h.start,
        h.end,
      ]);
    }
  }

  // ---------- Ngày lễ và nghỉ phép ----------

  listHolidays(): Promise<{ day: string; name: string }[]> {
    return this.db.query('SELECT day, name FROM holidays WHERE day >= CURRENT_DATE - 30 ORDER BY day');
  }

  async addHoliday(day: string, name: string): Promise<void> {
    await this.db.query(
      'INSERT INTO holidays (day, name) VALUES ($1, $2) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name',
      [day, name.trim()],
    );
  }

  async removeHoliday(day: string): Promise<void> {
    await this.db.query('DELETE FROM holidays WHERE day = $1', [day]);
  }

  listTimeOff(): Promise<{ id: string; staffId: string; staffName: string; startAt: Date; endAt: Date; reason: string }[]> {
    return this.db.query(
      `SELECT t.id, t.staff_id AS "staffId", s.full_name AS "staffName", t.start_at AS "startAt",
              t.end_at AS "endAt", t.reason
         FROM time_off t JOIN staff s ON s.id = t.staff_id
        WHERE t.end_at >= now() - interval '7 days'
        ORDER BY t.start_at`,
    );
  }

  async addTimeOff(staffId: string, startAt: Date, endAt: Date, reason: string): Promise<void> {
    if (startAt >= endAt) throw badRequest('INVALID_RANGE', 'Thời điểm bắt đầu phải trước thời điểm kết thúc');
    await this.db.query('INSERT INTO time_off (staff_id, start_at, end_at, reason) VALUES ($1, $2, $3, $4)', [
      staffId,
      startAt,
      endAt,
      reason.trim(),
    ]);
  }

  async removeTimeOff(id: string): Promise<void> {
    await this.db.query('DELETE FROM time_off WHERE id = $1', [id]);
  }
}
