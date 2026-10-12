import { Body, Controller, Get, Headers, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { Response } from 'express';
import { CUSTOMER_ACTOR } from '../auth/actor';
import { RateLimit, RateLimitGuard } from '../auth/guards';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PoliciesService } from '../policies/policies.service';
import { AppointmentsService } from './appointments.service';
import {
  AvailabilityQuery,
  CreateAppointmentDto,
  LookupAvailabilityDto,
  LookupCancelDto,
  LookupDto,
  LookupRescheduleDto,
} from './dto';

class StaffQuery {
  @IsOptional()
  @IsUUID('all')
  serviceId?: string;
}

/** API cho khách: xem dịch vụ, giờ trống, đặt lịch không cần đăng nhập, tra cứu bằng mã lịch + số điện thoại. */
@ApiTags('public')
@Controller()
@UseGuards(RateLimitGuard)
export class PublicController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
    private readonly idempotency: IdempotencyService,
    private readonly policies: PoliciesService,
  ) {}

  @Get('services')
  services() {
    return this.catalog.listServices(true);
  }

  @Get('staff')
  async staff(@Query() q: StaffQuery) {
    const list = await this.catalog.listStaff({ activeOnly: true, serviceId: q.serviceId });
    return list.map(({ id, fullName, title, serviceIds }) => ({ id, fullName, title, serviceIds }));
  }

  @Get('policies')
  async publicPolicies() {
    const p = await this.policies.get();
    return {
      slotStepMin: p.slotStepMin,
      minAdvanceMin: p.minAdvanceMin,
      maxAdvanceDays: p.maxAdvanceDays,
      holdMin: p.holdMin,
      autoConfirm: p.autoConfirm,
      changeDeadlineMin: p.changeDeadlineMin,
    };
  }

  @Get('availability')
  @RateLimit('availability', 120, 60)
  slots(@Query() q: AvailabilityQuery) {
    return this.availability.slots({ serviceId: q.serviceId, date: q.date, staffId: q.staffId, forAdmin: false });
  }

  /** Tạo lịch. Header Idempotency-Key bắt buộc: gửi lại cùng key trả lại kết quả cũ, không tạo lịch mới. */
  @Post('appointments')
  @RateLimit('booking', 10, 60)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.run('public', key, dto, () =>
      this.appointments.create(dto, CUSTOMER_ACTOR, 'online'),
    );
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Post('appointments/lookup')
  @HttpCode(200)
  @RateLimit('lookup', 20, 300)
  lookup(@Body() dto: LookupDto) {
    return this.appointments.lookup(dto.code, dto.phone);
  }

  @Post('appointments/lookup/cancel')
  @HttpCode(200)
  @RateLimit('lookup', 20, 300)
  async cancel(@Body() dto: LookupCancelDto) {
    const appt = await this.appointments.findForCustomer(dto.code, dto.phone);
    await this.appointments.cancel(appt.id, CUSTOMER_ACTOR, dto.reason);
    return this.appointments.lookup(dto.code, dto.phone);
  }

  /** Giờ trống để khách tự đổi lịch: cùng dịch vụ, cùng nhân viên, không tính chính lịch đang đổi. */
  @Post('appointments/lookup/availability')
  @HttpCode(200)
  @RateLimit('lookup', 60, 300)
  async lookupAvailability(@Body() dto: LookupAvailabilityDto) {
    const appt = await this.appointments.findForCustomer(dto.code, dto.phone);
    return this.availability.slots({
      serviceId: appt.service_id,
      staffId: appt.staff_id,
      date: dto.date,
      forAdmin: false,
      excludeAppointmentId: appt.id,
    });
  }

  @Post('appointments/lookup/reschedule')
  @HttpCode(200)
  @RateLimit('lookup', 20, 300)
  async reschedule(@Body() dto: LookupRescheduleDto) {
    const appt = await this.appointments.findForCustomer(dto.code, dto.phone);
    await this.appointments.reschedule(appt.id, { date: dto.date, time: dto.time }, CUSTOMER_ACTOR);
    return this.appointments.lookup(dto.code, dto.phone);
  }
}
