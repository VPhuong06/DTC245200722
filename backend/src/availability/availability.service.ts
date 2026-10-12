import { Injectable } from '@nestjs/common';
import { badRequest } from '../common/app-error';
import {
  addDays,
  formatVnDate,
  isDate,
  minutesFromVnMidnight,
  minutesToTime,
  timeToMinutes,
  vnDateTime,
  vnStartOfDay,
  vnToday,
  weekdayOf,
} from '../common/time';
import { CatalogService } from '../catalog/catalog.service';
import { DbService, Queryable } from '../db/db.service';
import { PoliciesService } from '../policies/policies.service';
import { computeSlots, Interval, StaffDay } from './slots';

export interface StaffDayDetail extends StaffDay {
  fullName: string;
  appointmentBusy: Interval[];
  timeOffBusy: Interval[];
  /** Số lịch đang chiếm giờ trong ngày, dùng để gán "nhân viên bất kỳ" cho người ít lịch nhất. */
  load: number;
}

export interface AvailabilityResult {
  date: string;
  closed: boolean;
  message?: string;
  slots: { time: string; staffIds: string[] }[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly db: DbService,
    private readonly catalog: CatalogService,
    private readonly policies: PoliciesService,
  ) {}

  async holidayOn(date: string, client: Queryable = this.db.pool): Promise<string | undefined> {
    const { rows } = await client.query<{ name: string }>('SELECT name FROM holidays WHERE day = $1', [date]);
    return rows[0]?.name;
  }

  /**
   * Ca làm và thời gian bận của các nhân viên đang hoạt động làm được dịch vụ trong một ngày.
   * `excludeAppointmentId` bỏ qua chính lịch đang được đổi để không tự chặn mình.
   */
  async staffDays(
    date: string,
    serviceId: string,
    opts: { staffIds?: string[]; excludeAppointmentId?: string; client?: Queryable } = {},
  ): Promise<StaffDayDetail[]> {
    const client = opts.client ?? this.db.pool;
    const dayStart = vnStartOfDay(date);
    const dayEnd = vnStartOfDay(addDays(date, 1));

    const { rows: staff } = await client.query<{ id: string; full_name: string }>(
      `SELECT st.id, st.full_name
         FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
        WHERE st.active AND ss.service_id = $1
          AND ($2::uuid[] IS NULL OR st.id = ANY($2::uuid[]))
        ORDER BY st.full_name`,
      [serviceId, opts.staffIds?.length ? opts.staffIds : null],
    );
    if (!staff.length) return [];
    const ids = staff.map((s) => s.id);

    const [{ rows: hours }, { rows: appts }, { rows: off }] = await Promise.all([
      client.query<{ staff_id: string; start_time: string; end_time: string }>(
        'SELECT staff_id, start_time::text, end_time::text FROM working_hours WHERE staff_id = ANY($1) AND weekday = $2',
        [ids, weekdayOf(date)],
      ),
      client.query<{ staff_id: string; start_at: Date; blocked_until: Date }>(
        `SELECT staff_id, start_at, blocked_until FROM appointments
          WHERE staff_id = ANY($1) AND status IN ('pending', 'confirmed')
            AND tstzrange(start_at, blocked_until, '[)') && tstzrange($2, $3, '[)')
            AND ($4::uuid IS NULL OR id <> $4)`,
        [ids, dayStart, dayEnd, opts.excludeAppointmentId ?? null],
      ),
      client.query<{ staff_id: string; start_at: Date; end_at: Date }>(
        `SELECT staff_id, start_at, end_at FROM time_off
          WHERE staff_id = ANY($1) AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')`,
        [ids, dayStart, dayEnd],
      ),
    ]);

    return staff.map((s) => {
      const appointmentBusy: Interval[] = appts
        .filter((a) => a.staff_id === s.id)
        .map((a) => [minutesFromVnMidnight(date, a.start_at), minutesFromVnMidnight(date, a.blocked_until)]);
      const timeOffBusy: Interval[] = off
        .filter((o) => o.staff_id === s.id)
        .map((o) => [minutesFromVnMidnight(date, o.start_at), minutesFromVnMidnight(date, o.end_at)]);
      return {
        staffId: s.id,
        fullName: s.full_name,
        windows: hours
          .filter((h) => h.staff_id === s.id)
          .map((h) => [timeToMinutes(h.start_time), timeToMinutes(h.end_time)] as Interval),
        appointmentBusy,
        timeOffBusy,
        busy: [...appointmentBusy, ...timeOffBusy],
        load: appointmentBusy.length,
      };
    });
  }

  /** Giờ trống cho trang đặt lịch. Khách bị giới hạn bởi đặt trước tối thiểu/tối đa; quản trị chỉ không đặt vào quá khứ. */
  async slots(params: {
    serviceId: string;
    date: string;
    staffId?: string;
    forAdmin: boolean;
    excludeAppointmentId?: string;
  }): Promise<AvailabilityResult> {
    const { serviceId, date, staffId, forAdmin } = params;
    if (!isDate(date)) throw badRequest('INVALID_DATE', 'Ngày không hợp lệ');

    const [service, policy] = await Promise.all([this.catalog.getService(serviceId), this.policies.get()]);
    if (!service.active) throw badRequest('SERVICE_INACTIVE', 'Dịch vụ đang tạm ngưng');

    const now = new Date();
    const today = vnToday(now);
    if (date < today) {
      return { date, closed: true, message: 'Ngày đã qua.', slots: [] };
    }
    if (!forAdmin) {
      const lastDay = addDays(today, policy.maxAdvanceDays);
      if (date > lastDay) {
        return {
          date,
          closed: true,
          message: `Chỉ nhận đặt lịch trước tối đa ${policy.maxAdvanceDays} ngày (đến ${formatVnDate(vnDateTime(lastDay, '00:00'))}).`,
          slots: [],
        };
      }
    }
    const holiday = await this.holidayOn(date);
    if (holiday) {
      return { date, closed: true, message: `Cơ sở nghỉ ngày ${formatVnDate(vnDateTime(date, '00:00'))} (${holiday}).`, slots: [] };
    }

    const days = await this.staffDays(date, serviceId, {
      staffIds: staffId ? [staffId] : undefined,
      excludeAppointmentId: params.excludeAppointmentId,
    });
    const earliest = new Date(now.getTime() + (forAdmin ? 0 : policy.minAdvanceMin) * 60_000);
    const earliestMinute = minutesFromVnMidnight(date, earliest);

    const slots = computeSlots({
      stepMin: policy.slotStepMin,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      earliestMinute: earliestMinute > 0 ? earliestMinute : null,
      staff: days,
    });

    const hasShift = days.some((d) => d.windows.length > 0);
    return {
      date,
      closed: !hasShift,
      message: !hasShift ? 'Không có nhân viên làm việc vào ngày này.' : slots.length ? undefined : 'Đã hết giờ trống trong ngày.',
      slots: slots.map((s) => ({ time: minutesToTime(s.minute), staffIds: s.staffIds })),
    };
  }
}
