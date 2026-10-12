import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Actor } from '../auth/actor';
import { AuthGuard, CurrentActor, Roles } from '../auth/guards';
import { CatalogService } from '../catalog/catalog.service';
import { badRequest } from '../common/app-error';
import { addDays, isDate, vnStartOfDay } from '../common/time';
import { DbService } from '../db/db.service';
import { PoliciesService } from '../policies/policies.service';
import { CustomerQuery, HolidayDto, PolicyDto, RangeQuery, ServiceDto, StaffDto, TimeOffDto } from './admin.dto';

/** Quản lý danh mục: dịch vụ, nhân viên, giờ làm, ngày nghỉ, chính sách, khách hàng, thống kê. */
@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('admin')
export class AdminCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly policies: PoliciesService,
    private readonly db: DbService,
  ) {}

  private audit(actor: Actor, action: string, entity: string, entityId: string | null, data: unknown) {
    return this.db.query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5)',
      [actor.id ?? null, action, entity, entityId, JSON.stringify(data ?? {})],
    );
  }

  // ---------- Dịch vụ

  @Get('services')
  @Roles('admin', 'staff')
  services() {
    return this.catalog.listServices(false);
  }

  @Post('services')
  async createService(@Body() dto: ServiceDto, @CurrentActor() actor: Actor) {
    const s = await this.catalog.createService(dto);
    await this.audit(actor, 'create', 'service', s.id, dto);
    return s;
  }

  @Put('services/:id')
  async updateService(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ServiceDto, @CurrentActor() actor: Actor) {
    const s = await this.catalog.updateService(id, dto);
    await this.audit(actor, 'update', 'service', id, dto);
    return s;
  }

  // ---------- Nhân viên

  @Get('staff')
  @Roles('admin', 'staff')
  staff() {
    return this.catalog.listStaff({ activeOnly: false });
  }

  @Post('staff')
  async createStaff(@Body() dto: StaffDto, @CurrentActor() actor: Actor) {
    const s = await this.catalog.createStaff(dto);
    await this.audit(actor, 'create', 'staff', s.id, dto);
    return s;
  }

  @Put('staff/:id')
  async updateStaff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffDto, @CurrentActor() actor: Actor) {
    const s = await this.catalog.updateStaff(id, dto);
    await this.audit(actor, 'update', 'staff', id, dto);
    return s;
  }

  // ---------- Ngày lễ, nghỉ phép

  @Get('holidays')
  holidays() {
    return this.catalog.listHolidays();
  }

  @Post('holidays')
  async addHoliday(@Body() dto: HolidayDto, @CurrentActor() actor: Actor) {
    if (!isDate(dto.day)) throw badRequest('INVALID_DATE', 'Ngày không hợp lệ');
    await this.catalog.addHoliday(dto.day, dto.name);
    await this.audit(actor, 'create', 'holiday', dto.day, dto);
    return this.catalog.listHolidays();
  }

  @Delete('holidays/:day')
  @HttpCode(204)
  async removeHoliday(@Param('day') day: string, @CurrentActor() actor: Actor) {
    if (!isDate(day)) throw badRequest('INVALID_DATE', 'Ngày không hợp lệ');
    await this.catalog.removeHoliday(day);
    await this.audit(actor, 'delete', 'holiday', day, {});
  }

  @Get('time-off')
  timeOff() {
    return this.catalog.listTimeOff();
  }

  @Post('time-off')
  async addTimeOff(@Body() dto: TimeOffDto, @CurrentActor() actor: Actor) {
    await this.catalog.addTimeOff(dto.staffId, new Date(dto.startAt), new Date(dto.endAt), dto.reason ?? '');
    await this.audit(actor, 'create', 'time_off', dto.staffId, dto);
    return this.catalog.listTimeOff();
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  async removeTimeOff(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.catalog.removeTimeOff(id);
    await this.audit(actor, 'delete', 'time_off', id, {});
  }

  // ---------- Chính sách

  @Get('policies')
  getPolicies() {
    return this.policies.get();
  }

  @Put('policies')
  async updatePolicies(@Body() dto: PolicyDto, @CurrentActor() actor: Actor) {
    const p = await this.policies.update(dto);
    await this.audit(actor, 'update', 'booking_policies', '1', dto);
    return p;
  }

  // ---------- Khách hàng

  @Get('customers')
  customers(@Query() q: CustomerQuery) {
    const like = q.q?.trim() ? `%${q.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
    return this.db.query(
      `SELECT c.id, c.full_name AS "fullName", c.phone, c.email, c.created_at AS "createdAt",
              count(a.id) AS "totalAppointments",
              count(a.id) FILTER (WHERE a.status = 'completed') AS "completed",
              count(a.id) FILTER (WHERE a.status = 'no_show') AS "noShow",
              count(a.id) FILTER (WHERE a.status = 'cancelled') AS "cancelled",
              max(a.start_at) AS "lastAppointmentAt"
         FROM customers c LEFT JOIN appointments a ON a.customer_id = c.id
        WHERE ($1::text IS NULL OR c.full_name ILIKE $1 OR c.phone LIKE $1 OR c.email ILIKE $1)
        GROUP BY c.id
        ORDER BY max(a.start_at) DESC NULLS LAST, c.full_name
        LIMIT 200`,
      [like],
    );
  }

  // ---------- Thống kê

  @Get('stats')
  async stats(@Query() q: RangeQuery) {
    if (!isDate(q.from) || !isDate(q.to) || q.to < q.from) throw badRequest('INVALID_RANGE', 'Khoảng ngày không hợp lệ');
    const params = [vnStartOfDay(q.from), vnStartOfDay(addDays(q.to, 1))];
    const [byStatus, byService, byStaff] = await Promise.all([
      this.db.query(
        `SELECT status, count(*) AS count FROM appointments WHERE start_at >= $1 AND start_at < $2 GROUP BY status`,
        params,
      ),
      this.db.query(
        `SELECT s.name, count(*) AS count,
                COALESCE(sum(a.price_vnd) FILTER (WHERE a.status = 'completed'), 0) AS revenue
           FROM appointments a JOIN services s ON s.id = a.service_id
          WHERE a.start_at >= $1 AND a.start_at < $2 GROUP BY s.name ORDER BY count DESC`,
        params,
      ),
      this.db.query(
        `SELECT st.full_name AS name, count(*) AS count,
                count(*) FILTER (WHERE a.status = 'no_show') AS "noShow"
           FROM appointments a JOIN staff st ON st.id = a.staff_id
          WHERE a.start_at >= $1 AND a.start_at < $2 GROUP BY st.full_name ORDER BY count DESC`,
        params,
      ),
    ]);
    return { byStatus, byService, byStaff };
  }
}
