import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AppError, badRequest, conflict, notFound } from '../common/app-error';
import { logger } from '../common/json-logger';
import {
  addDays,
  formatVnDateTime,
  isDate,
  isTime,
  minutesToTime,
  timeToMinutes,
  vnDateTime,
  vnStartOfDay,
  vnTimeOf,
  vnToday,
} from '../common/time';
import { Actor, SYSTEM_ACTOR } from '../auth/actor';
import { AvailabilityService, StaffDayDetail } from '../availability/availability.service';
import { Interval, overlaps } from '../availability/slots';
import { CatalogService, Service } from '../catalog/catalog.service';
import { DbService, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, pgCode, Queryable } from '../db/db.service';
import { NotificationsService, NotifyAppointment } from '../notifications/notifications.service';
import { PoliciesService } from '../policies/policies.service';

export const STATUSES = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'expired'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  no_show: 'Không đến',
  cancelled: 'Đã hủy',
  expired: 'Hết hạn',
};

const ACTIVE: Status[] = ['pending', 'confirmed'];

export interface AppointmentView {
  id: string;
  ref: string;
  lookupCode: string;
  status: Status;
  startAt: string;
  endAt: string;
  durationMin: number;
  priceVnd: number;
  note: string;
  cancelReason: string | null;
  source: 'online' | 'admin';
  holdExpiresAt: string | null;
  createdAt: string;
  customer: { id: string; fullName: string; phone: string; email: string | null };
  service: { id: string; name: string };
  staff: { id: string; fullName: string };
}

export interface AppointmentEvent {
  id: string;
  type: string;
  message: string;
  actorType: string;
  createdAt: string;
}

interface Row {
  id: string;
  ref_no: number;
  lookup_code: string;
  status: Status;
  start_at: Date;
  end_at: Date;
  blocked_until: Date;
  duration_min: number;
  price_vnd: number;
  note: string;
  cancel_reason: string | null;
  source: 'online' | 'admin';
  hold_expires_at: Date | null;
  created_at: Date;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_id: string;
  service_name: string;
  staff_id: string;
  staff_name: string;
}

const SELECT = `
  SELECT a.id, a.ref_no, a.lookup_code, a.status, a.start_at, a.end_at, a.blocked_until, a.duration_min,
         a.price_vnd, a.note, a.cancel_reason, a.source, a.hold_expires_at, a.created_at,
         a.customer_id, c.full_name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         a.service_id, s.name AS service_name, a.staff_id, st.full_name AS staff_name
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    JOIN services s ON s.id = a.service_id
    JOIN staff st ON st.id = a.staff_id`;

export const refOf = (refNo: number) => `LH${refNo}`;

function toView(r: Row): AppointmentView {
  return {
    id: r.id,
    ref: refOf(r.ref_no),
    lookupCode: r.lookup_code,
    status: r.status,
    startAt: r.start_at.toISOString(),
    endAt: r.end_at.toISOString(),
    durationMin: r.duration_min,
    priceVnd: r.price_vnd,
    note: r.note,
    cancelReason: r.cancel_reason,
    source: r.source,
    holdExpiresAt: r.hold_expires_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    customer: { id: r.customer_id, fullName: r.customer_name, phone: r.customer_phone, email: r.customer_email },
    service: { id: r.service_id, name: r.service_name },
    staff: { id: r.staff_id, fullName: r.staff_name },
  };
}

function toNotify(r: Row): NotifyAppointment {
  return {
    id: r.id,
    ref: refOf(r.ref_no),
    lookupCode: r.lookup_code,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    serviceName: r.service_name,
    staffName: r.staff_name,
    startAt: r.start_at,
    endAt: r.end_at,
  };
}

/** Bỏ khoảng trắng, dấu chấm, gạch; đổi +84 → 0. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s.\-()]/g, '');
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
}

export function isValidPhone(phone: string): boolean {
  return /^0\d{9}$/.test(phone);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã tra cứu 8 ký tự ngẫu nhiên (~10^12 tổ hợp), không đoán được; tra cứu luôn kèm số điện thoại. */
export function generateLookupCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeLookupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export interface CustomerInput {
  fullName: string;
  phone: string;
  email?: string | null;
}

export interface CreateInput {
  customer: CustomerInput;
  serviceId: string;
  /** Bỏ trống = "Nhân viên bất kỳ". */
  staffId?: string | null;
  date: string;
  time: string;
  note?: string;
  consent?: boolean;
}

export interface RescheduleInput {
  serviceId?: string;
  staffId?: string;
  date: string;
  time: string;
}

export interface ListFilters {
  from: string;
  to: string;
  q?: string;
  serviceId?: string;
  staffId?: string;
  status?: Status;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly db: DbService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly policies: PoliciesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- Đọc

  private async row(id: string, client: Queryable = this.db.pool, forUpdate = false): Promise<Row> {
    const { rows } = await client.query<Row>(`${SELECT} WHERE a.id = $1 ${forUpdate ? 'FOR UPDATE OF a' : ''}`, [id]);
    if (!rows[0]) throw notFound('Không tìm thấy lịch hẹn');
    return rows[0];
  }

  async get(id: string, actor: Actor): Promise<AppointmentView & { events: AppointmentEvent[] }> {
    const r = await this.row(id);
    this.assertCanSee(actor, r);
    return { ...toView(r), events: await this.events(id) };
  }

  async events(id: string): Promise<AppointmentEvent[]> {
    return this.db.query<AppointmentEvent>(
      `SELECT id, type, message, actor_type AS "actorType", created_at AS "createdAt"
         FROM appointment_events WHERE appointment_id = $1 ORDER BY created_at, id`,
      [id],
    );
  }

  async list(filters: ListFilters, actor: Actor): Promise<{ items: AppointmentView[]; counts: Record<string, number> }> {
    if (!isDate(filters.from) || !isDate(filters.to) || filters.to < filters.from) {
      throw badRequest('INVALID_RANGE', 'Khoảng ngày không hợp lệ');
    }
    if (addDays(filters.from, 62) < filters.to) {
      throw badRequest('RANGE_TOO_LARGE', 'Chỉ xem tối đa 62 ngày một lần');
    }
    const staffId = actor.role === 'staff' ? (actor.staffId ?? '00000000-0000-0000-0000-000000000000') : filters.staffId;
    const q = filters.q?.trim() ? `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
    const rows = await this.db.query<Row>(
      `${SELECT}
        WHERE a.start_at >= $1 AND a.start_at < $2
          AND ($3::text IS NULL OR c.full_name ILIKE $3 OR c.phone LIKE $3
               OR ('LH' || a.ref_no) ILIKE $3 OR a.lookup_code ILIKE $3)
          AND ($4::uuid IS NULL OR a.service_id = $4)
          AND ($5::uuid IS NULL OR a.staff_id = $5)
        ORDER BY a.start_at, st.full_name`,
      [vnStartOfDay(filters.from), vnStartOfDay(addDays(filters.to, 1)), q, filters.serviceId ?? null, staffId ?? null],
    );
    const counts: Record<string, number> = { all: rows.length };
    for (const s of STATUSES) counts[s] = 0;
    for (const r of rows) counts[r.status]++;
    const items = (filters.status ? rows.filter((r) => r.status === filters.status) : rows).map(toView);
    return { items, counts };
  }

  // ---------------------------------------------------------------- Tạo lịch

  async create(input: CreateInput, actor: Actor, source: 'online' | 'admin'): Promise<AppointmentView> {
    const customer = this.validateCustomer(input.customer);
    if (source === 'online' && !input.consent) {
      throw badRequest('CONSENT_REQUIRED', 'Vui lòng đồng ý với chính sách quyền riêng tư để đặt lịch');
    }
    const [service, policy] = await Promise.all([this.catalog.getService(input.serviceId), this.policies.get()]);
    if (!service.active) throw badRequest('SERVICE_INACTIVE', 'Dịch vụ đang tạm ngưng');

    const start = await this.validateStartTime(input.date, input.time, source === 'online');
    const startMin = timeToMinutes(input.time);
    const end = new Date(start.getTime() + service.durationMin * 60_000);
    const blockedUntil = new Date(end.getTime() + service.bufferMin * 60_000);

    // Danh sách nhân viên thử lần lượt.
    const days = await this.availability.staffDays(input.date, service.id, {
      staffIds: input.staffId ? [input.staffId] : undefined,
    });
    let candidates: StaffDayDetail[];
    if (input.staffId) {
      const day = days[0];
      if (!day) throw badRequest('STAFF_CANNOT_SERVE', 'Nhân viên này không thực hiện dịch vụ đã chọn hoặc đang tạm nghỉ');
      const problem = await this.explainUnavailable(day, service, startMin, start, blockedUntil);
      if (problem) throw problem;
      candidates = [day];
    } else {
      // "Nhân viên bất kỳ": người còn trống có ít lịch nhất trong ngày được ưu tiên.
      candidates = days
        .filter((d) => this.isFree(d, service, startMin))
        .sort((a, b) => a.load - b.load || a.fullName.localeCompare(b.fullName, 'vi'));
      if (!candidates.length) {
        this.logConflict(null, start, 'no_staff_available');
        throw conflict('SLOT_TAKEN', 'Khung giờ này không còn nhân viên trống. Vui lòng chọn giờ khác.');
      }
    }

    const status: Status = policy.autoConfirm ? 'confirmed' : 'pending';
    const holdExpiresAt = status === 'pending' && source === 'online' ? new Date(Date.now() + policy.holdMin * 60_000) : null;

    for (let i = 0; i < candidates.length; i++) {
      const staff = candidates[i];
      try {
        const id = await this.db.tx(async (c) => {
          const customerId = await this.upsertCustomer(c, customer, source === 'online');
          const apptId = await this.insertAppointment(c, {
            customerId,
            serviceId: service.id,
            staffId: staff.staffId,
            start,
            end,
            blockedUntil,
            durationMin: service.durationMin,
            priceVnd: service.priceVnd,
            status,
            note: input.note?.trim() ?? '',
            source,
            createdBy: actor.type === 'user' ? actor.id! : null,
            holdExpiresAt,
          });
          const message =
            source === 'online'
              ? `Khách gửi yêu cầu đặt lịch${status === 'confirmed' ? ' · Tự động xác nhận' : ''}`
              : `${actor.name} tạo lịch · ${STATUS_LABELS[status]}`;
          await this.addEvent(c, apptId, 'created', message, actor);
          const r = await this.row(apptId, c);
          await this.notifications.enqueue(c, toNotify(r), status === 'confirmed' ? 'confirmed' : 'received');
          if (status === 'confirmed') await this.notifications.scheduleReminders(c, toNotify(r), policy.reminderOffsetsMin);
          return apptId;
        });
        const view = toView(await this.row(id));
        logger.info('appointment_created', { appointment: view.ref, staff_id: staff.staffId, source, status });
        return view;
      } catch (err) {
        if (pgCode(err) !== PG_EXCLUSION_VIOLATION) throw err;
        // Người được chọn vừa bị chiếm giờ (đặt đồng thời): thử nhân viên kế tiếp.
        if (i < candidates.length - 1) continue;
        throw await this.conflictError(staff.staffId, staff.fullName, start, blockedUntil);
      }
    }
    throw conflict('SLOT_TAKEN', 'Khung giờ vừa có người đặt. Vui lòng chọn giờ khác.');
  }

  // ---------------------------------------------------------------- Đổi lịch

  async reschedule(id: string, input: RescheduleInput, actor: Actor): Promise<AppointmentView> {
    const current = await this.row(id);
    this.assertCanSee(actor, current);
    if (!ACTIVE.includes(current.status)) {
      throw badRequest('INVALID_STATUS', `Không thể đổi lịch đang ở trạng thái "${STATUS_LABELS[current.status]}"`);
    }
    const policy = await this.policies.get();
    if (actor.type === 'customer') this.assertBeforeDeadline(current, policy.changeDeadlineMin);

    const service = await this.catalog.getService(input.serviceId ?? current.service_id);
    if (!service.active) throw badRequest('SERVICE_INACTIVE', 'Dịch vụ đang tạm ngưng');
    const staffId = input.staffId ?? current.staff_id;

    const start = await this.validateStartTime(input.date, input.time, actor.type === 'customer');
    const end = new Date(start.getTime() + service.durationMin * 60_000);
    const blockedUntil = new Date(end.getTime() + service.bufferMin * 60_000);
    if (start.getTime() === current.start_at.getTime() && staffId === current.staff_id && service.id === current.service_id) {
      throw badRequest('NO_CHANGE', 'Thời gian mới trùng với lịch hiện tại');
    }

    const [day] = await this.availability.staffDays(input.date, service.id, {
      staffIds: [staffId],
      excludeAppointmentId: id,
    });
    if (!day) throw badRequest('STAFF_CANNOT_SERVE', 'Nhân viên này không thực hiện dịch vụ đã chọn hoặc đang tạm nghỉ');
    const problem = await this.explainUnavailable(day, service, timeToMinutes(input.time), start, blockedUntil, id);
    if (problem) throw problem;

    try {
      await this.db.tx(async (c) => {
        const locked = await this.row(id, c, true);
        if (!ACTIVE.includes(locked.status)) {
          throw badRequest('INVALID_STATUS', `Lịch đã chuyển sang "${STATUS_LABELS[locked.status]}"`);
        }
        await c.query(
          `UPDATE appointments
              SET service_id = $2, staff_id = $3, start_at = $4, end_at = $5, blocked_until = $6,
                  duration_min = $7, price_vnd = $8, updated_at = now()
            WHERE id = $1`,
          [id, service.id, staffId, start, end, blockedUntil, service.durationMin, service.id === locked.service_id ? locked.price_vnd : service.priceVnd],
        );
        let message = `Đổi từ ${formatVnDateTime(locked.start_at)} sang ${formatVnDateTime(start)}`;
        if (staffId !== locked.staff_id) message += ` · Nhân viên: ${locked.staff_name} → ${day.fullName}`;
        if (service.id !== locked.service_id) message += ` · Dịch vụ: ${locked.service_name} → ${service.name}`;
        if (actor.type === 'customer') message = `Khách đổi lịch: ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
        await this.addEvent(c, id, 'rescheduled', message, actor, {
          from: locked.start_at.toISOString(),
          to: start.toISOString(),
          fromStaffId: locked.staff_id,
          toStaffId: staffId,
        });
        const updated = await this.row(id, c);
        await this.notifications.cancelPending(c, id);
        await this.notifications.enqueue(c, toNotify(updated), 'rescheduled');
        if (updated.status === 'confirmed') {
          await this.notifications.scheduleReminders(c, toNotify(updated), policy.reminderOffsetsMin);
        }
      });
    } catch (err) {
      // Giao dịch đã ROLLBACK: lịch cũ giữ nguyên.
      if (pgCode(err) === PG_EXCLUSION_VIOLATION) throw await this.conflictError(staffId, day.fullName, start, blockedUntil, id);
      throw err;
    }
    return toView(await this.row(id));
  }

  // ---------------------------------------------------------------- Chuyển trạng thái

  confirm(id: string, actor: Actor): Promise<AppointmentView> {
    return this.transition(id, actor, ['pending'], 'confirmed', `${actor.name} xác nhận lịch`, async (c, r, policy) => {
      await this.notifications.enqueue(c, toNotify(r), 'confirmed');
      await this.notifications.scheduleReminders(c, toNotify(r), policy.reminderOffsetsMin);
    });
  }

  cancel(id: string, actor: Actor, reason: string): Promise<AppointmentView> {
    const clean = reason?.trim() ?? '';
    if (clean.length < 3) throw badRequest('REASON_REQUIRED', 'Vui lòng nhập lý do hủy (tối thiểu 3 ký tự)');
    const message = actor.type === 'customer' ? `Khách hủy lịch: ${clean}` : `Hủy lịch: ${clean}`;
    return this.transition(
      id,
      actor,
      ACTIVE,
      'cancelled',
      message,
      async (c, r) => {
        await this.notifications.cancelPending(c, id);
        await this.notifications.enqueue(c, toNotify(r), 'cancelled');
      },
      clean,
    );
  }

  complete(id: string, actor: Actor): Promise<AppointmentView> {
    return this.transition(id, actor, ['confirmed'], 'completed', `${actor.name} đánh dấu hoàn thành`, (c) =>
      this.notifications.cancelPending(c, id),
    );
  }

  noShow(id: string, actor: Actor): Promise<AppointmentView> {
    return this.transition(id, actor, ['confirmed'], 'no_show', 'Khách không đến theo lịch', (c) =>
      this.notifications.cancelPending(c, id),
    );
  }

  private async transition(
    id: string,
    actor: Actor,
    from: Status[],
    to: Status,
    message: string,
    after?: (c: PoolClient, r: Row, policy: Awaited<ReturnType<PoliciesService['get']>>) => Promise<void>,
    cancelReason?: string,
  ): Promise<AppointmentView> {
    const policy = await this.policies.get();
    await this.db.tx(async (c) => {
      const current = await this.row(id, c, true);
      this.assertCanSee(actor, current);
      if (!from.includes(current.status)) {
        throw badRequest(
          'INVALID_STATUS',
          `Không thể chuyển lịch từ "${STATUS_LABELS[current.status]}" sang "${STATUS_LABELS[to]}"`,
        );
      }
      if (actor.type === 'customer') this.assertBeforeDeadline(current, policy.changeDeadlineMin);
      await c.query(
        `UPDATE appointments SET status = $2, cancel_reason = COALESCE($3, cancel_reason),
                hold_expires_at = NULL, updated_at = now()
          WHERE id = $1`,
        [id, to, cancelReason ?? null],
      );
      await this.addEvent(c, id, to, message, actor, { from: current.status, to });
      if (after) await after(c, await this.row(id, c), policy);
    });
    const view = toView(await this.row(id));
    logger.info('appointment_status_changed', { appointment: view.ref, status: to, actor: actor.type });
    return view;
  }

  /** Worker: lịch chờ xác nhận quá thời gian giữ chỗ → Hết hạn (giải phóng giờ). */
  async expireHolds(): Promise<number> {
    const due = await this.db.query<{ id: string }>(
      `SELECT id FROM appointments WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < now()
        ORDER BY hold_expires_at LIMIT 100`,
    );
    let count = 0;
    for (const { id } of due) {
      try {
        await this.transition(id, SYSTEM_ACTOR, ['pending'], 'expired', 'Hết thời gian giữ chỗ · Lịch tự động hết hạn', async (c, r) => {
          await this.notifications.enqueue(c, toNotify(r), 'expired');
        });
        count++;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    return count;
  }

  // ---------------------------------------------------------------- Khách tra cứu bằng mã lịch + số điện thoại

  async findForCustomer(code: string, phone: string): Promise<Row> {
    const { rows } = await this.db.pool.query<Row>(`${SELECT} WHERE a.lookup_code = $1 AND c.phone = $2`, [
      normalizeLookupCode(code),
      normalizePhone(phone),
    ]);
    if (!rows[0]) throw notFound('Không tìm thấy lịch với mã tra cứu và số điện thoại này');
    return rows[0];
  }

  async lookup(code: string, phone: string) {
    const r = await this.findForCustomer(code, phone);
    const policy = await this.policies.get();
    const deadline = new Date(r.start_at.getTime() - policy.changeDeadlineMin * 60_000);
    return {
      ...toView(r),
      events: await this.events(r.id),
      changeDeadline: deadline.toISOString(),
      canChange: ACTIVE.includes(r.status) && deadline.getTime() > Date.now(),
    };
  }

  // ---------------------------------------------------------------- Hỗ trợ

  private validateCustomer(c: CustomerInput): CustomerInput {
    const fullName = c.fullName?.trim().replace(/\s+/g, ' ') ?? '';
    const phone = normalizePhone(c.phone ?? '');
    const email = c.email?.trim().toLowerCase() || null;
    if (fullName.length < 2) throw badRequest('INVALID_NAME', 'Vui lòng nhập họ tên khách hàng');
    if (!isValidPhone(phone)) throw badRequest('INVALID_PHONE', 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');
    return { fullName, phone, email };
  }

  private async validateStartTime(date: string, time: string, asCustomer: boolean): Promise<Date> {
    if (!isDate(date)) throw badRequest('INVALID_DATE', 'Ngày hẹn không hợp lệ');
    if (!isTime(time)) throw badRequest('INVALID_TIME', 'Giờ bắt đầu không hợp lệ (định dạng HH:mm)');
    const start = vnDateTime(date, time);
    const now = Date.now();
    if (start.getTime() <= now) throw badRequest('IN_PAST', 'Không thể đặt lịch vào thời điểm đã qua');

    if (asCustomer) {
      const policy = await this.policies.get();
      if (start.getTime() < now + policy.minAdvanceMin * 60_000) {
        throw badRequest('TOO_SOON', `Vui lòng đặt trước giờ hẹn ít nhất ${formatMinutes(policy.minAdvanceMin)}`);
      }
      if (date > addDays(vnToday(), policy.maxAdvanceDays)) {
        throw badRequest('TOO_FAR', `Chỉ nhận đặt lịch trước tối đa ${policy.maxAdvanceDays} ngày`);
      }
    }
    const holiday = await this.availability.holidayOn(date);
    if (holiday) throw badRequest('HOLIDAY', `Cơ sở nghỉ ngày này (${holiday})`);
    return start;
  }

  private isFree(day: StaffDayDetail, service: Service, startMin: number): boolean {
    const need: Interval = [startMin, startMin + service.durationMin + service.bufferMin];
    return day.windows.some(([ws, we]) => need[0] >= ws && need[1] <= we) && !day.busy.some((b) => overlaps(need, b));
  }

  /** Lý do một nhân viên không nhận được lịch ở giờ này, hoặc null nếu còn trống. */
  private async explainUnavailable(
    day: StaffDayDetail,
    service: Service,
    startMin: number,
    start: Date,
    blockedUntil: Date,
    excludeId?: string,
  ): Promise<AppError | null> {
    const need: Interval = [startMin, startMin + service.durationMin + service.bufferMin];
    if (!day.windows.length) {
      return badRequest('STAFF_OFF_DAY', `${day.fullName} không làm việc vào ngày này. Chọn ngày hoặc nhân viên khác.`);
    }
    if (!day.windows.some(([ws, we]) => need[0] >= ws && need[1] <= we)) {
      const hours = day.windows.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`).join(', ');
      const length = service.bufferMin
        ? `${service.durationMin} phút + ${service.bufferMin} phút chuẩn bị`
        : `${service.durationMin} phút`;
      return badRequest(
        'OUTSIDE_WORKING_HOURS',
        `Lịch ${length} phải nằm trong giờ làm của ${day.fullName} (${hours}).`,
      );
    }
    if (day.timeOffBusy.some((b) => overlaps(need, b))) {
      this.logConflict(day.staffId, start, 'time_off');
      return conflict('STAFF_TIME_OFF', `${day.fullName} nghỉ trong khoảng thời gian này. Chọn giờ hoặc nhân viên khác.`);
    }
    if (day.appointmentBusy.some((b) => overlaps(need, b))) {
      return this.conflictError(day.staffId, day.fullName, start, blockedUntil, excludeId);
    }
    return null;
  }

  private async conflictError(
    staffId: string,
    staffName: string,
    start: Date,
    blockedUntil: Date,
    excludeId?: string,
  ): Promise<AppError> {
    this.logConflict(staffId, start, 'overlap');
    const other = await this.db.one<{ start_at: Date; end_at: Date }>(
      `SELECT start_at, end_at FROM appointments
        WHERE staff_id = $1 AND status IN ('pending', 'confirmed')
          AND tstzrange(start_at, blocked_until, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR id <> $4)
        ORDER BY start_at LIMIT 1`,
      [staffId, start, blockedUntil, excludeId ?? null],
    );
    if (!other) {
      return conflict('SLOT_TAKEN', 'Khung giờ vừa có người đặt. Vui lòng chọn giờ khác.');
    }
    return new AppError(
      HttpStatus.CONFLICT,
      'BOOKING_CONFLICT',
      `${staffName} đã có lịch ${vnTimeOf(other.start_at)}–${vnTimeOf(other.end_at)}. Chọn giờ hoặc nhân viên khác.`,
      { staffId, conflictStart: other.start_at.toISOString(), conflictEnd: other.end_at.toISOString() },
    );
  }

  private logConflict(staffId: string | null, start: Date, reason: string): void {
    logger.write('warn', 'booking_conflict', { staff_id: staffId, start_at: start.toISOString(), reason });
  }

  private assertCanSee(actor: Actor, r: Row): void {
    if (actor.type === 'user' && actor.role === 'staff' && actor.staffId !== r.staff_id) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Bạn chỉ thao tác được lịch được phân công cho mình');
    }
  }

  private assertBeforeDeadline(r: Row, deadlineMin: number): void {
    if (r.start_at.getTime() - Date.now() < deadlineMin * 60_000) {
      throw badRequest(
        'CHANGE_DEADLINE_PASSED',
        `Chỉ được tự đổi hoặc hủy trước giờ hẹn ${formatMinutes(deadlineMin)}. Vui lòng liên hệ cơ sở.`,
      );
    }
  }

  private async upsertCustomer(c: PoolClient, customer: CustomerInput, withConsent: boolean): Promise<string> {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO customers (full_name, phone, email, consent_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             email = COALESCE(EXCLUDED.email, customers.email),
             consent_at = COALESCE(EXCLUDED.consent_at, customers.consent_at)
       RETURNING id`,
      [customer.fullName, customer.phone, customer.email ?? null, withConsent ? new Date() : null],
    );
    return rows[0].id;
  }

  private async insertAppointment(
    c: PoolClient,
    a: {
      customerId: string;
      serviceId: string;
      staffId: string;
      start: Date;
      end: Date;
      blockedUntil: Date;
      durationMin: number;
      priceVnd: number;
      status: Status;
      note: string;
      source: 'online' | 'admin';
      createdBy: string | null;
      holdExpiresAt: Date | null;
    },
  ): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      await c.query('SAVEPOINT insert_appt');
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO appointments (lookup_code, customer_id, service_id, staff_id, start_at, end_at, blocked_until,
                                     duration_min, price_vnd, status, note, source, created_by, hold_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id`,
          [
            generateLookupCode(),
            a.customerId,
            a.serviceId,
            a.staffId,
            a.start,
            a.end,
            a.blockedUntil,
            a.durationMin,
            a.priceVnd,
            a.status,
            a.note,
            a.source,
            a.createdBy,
            a.holdExpiresAt,
          ],
        );
        await c.query('RELEASE SAVEPOINT insert_appt');
        return rows[0].id;
      } catch (err) {
        await c.query('ROLLBACK TO SAVEPOINT insert_appt');
        // Trùng mã tra cứu (rất hiếm): sinh mã khác và thử lại.
        if (pgCode(err) === PG_UNIQUE_VIOLATION && attempt < 3) continue;
        throw err;
      }
    }
  }

  private async addEvent(
    c: Queryable,
    appointmentId: string,
    type: string,
    message: string,
    actor: Actor,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await c.query(
      `INSERT INTO appointment_events (appointment_id, type, message, actor_type, actor_id, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [appointmentId, type, message, actor.type, actor.id ?? null, JSON.stringify(data)],
    );
  }
}

function formatMinutes(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} ngày`;
  if (min % 60 === 0) return `${min / 60} giờ`;
  return `${min} phút`;
}
